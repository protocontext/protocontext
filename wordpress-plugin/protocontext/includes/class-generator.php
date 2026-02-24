<?php
/**
 * ProtoContext Generator — builds context.txt files from WordPress data.
 *
 * Two output types:
 *   1. INDEX (/context.txt) — sitemap of all available context files with descriptions
 *   2. PAGE  (/context/{slug}.txt) — full context.txt for a single page/post/product
 *
 * Page builder support: Elementor, WPBakery, Divi, ACF, Gutenberg, Classic.
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProtoContext_Generator {

    private $settings;
    private $max_section_chars = 1000;
    private $max_total_bytes = 500 * 1024;

    private $exclude_slugs = [
        'cart', 'checkout', 'my-account', 'account', 'login', 'register',
        'privacy-policy', 'cookie-policy', 'terms-and-conditions',
        'sample-page', 'hello-world', 'feed', 'wp-json',
    ];

    private $builder_patterns = [
        '/\[elementor-template[^\]]*\]/',
        '/\[vc_[^\]]*\]/', '/\[\/vc_[^\]]*\]/',
        '/\[et_pb_[^\]]*\]/', '/\[\/et_pb_[^\]]*\]/',
        '/\[fusion_[^\]]*\]/', '/\[\/fusion_[^\]]*\]/',
        '/\[fl_builder[^\]]*\]/',
        '/\[\/?[a-zA-Z_][a-zA-Z0-9_-]*(?:\s[^\]]*)?\]/',
    ];

    public function __construct() {
        $this->settings = get_option('protocontext_settings', []);
    }

    // =========================================================================
    //  PUBLIC API
    // =========================================================================

    /**
     * Generate the index/sitemap at /context.txt
     * Lists all available context files with a one-line description each.
     */
    public function generate_index(): string {
        $parts = [];

        // Header
        $parts[] = $this->build_header();
        $parts[] = $this->build_metadata();

        // Site Map section: list every available context file
        $parts[] = $this->build_sitemap();

        return implode("\n\n", array_filter($parts));
    }

    /**
     * Generate a full context.txt for a single page/post/product.
     * Returns null if the slug doesn't match any published content.
     */
    public function generate_page(string $slug, string $type = ''): ?string {
        // Manual mode: check manual sections
        $mode = $this->settings['mode'] ?? 'auto';
        if ($mode === 'manual') {
            return $this->generate_manual_page($slug);
        }

        // WooCommerce category pages: /context/shop/{category-slug}.txt
        if ($type === 'shop' && $this->is_woocommerce_active()) {
            return $this->build_category_context($slug);
        }

        // Find the post by slug (and optional type)
        $post = $this->find_post($slug, $type);
        if (!$post) return null;

        return $this->build_page_context($post);
    }

    /**
     * Legacy: generate a single combined context.txt (for preview in admin).
     */
    public function generate(): string {
        return $this->generate_index();
    }

    // =========================================================================
    //  INDEX / SITEMAP
    // =========================================================================

    /**
     * Build the sitemap section that lists all context files.
     */
    private function build_sitemap(): string {
        $domain = wp_parse_url(home_url(), PHP_URL_HOST);
        $entries = $this->discover_all_entries();

        if (empty($entries)) {
            return "## section: Site Map\n\nNo published content found.";
        }

        // Group by type
        $grouped = [];
        foreach ($entries as $entry) {
            $type = $entry['type_label'];
            if (!isset($grouped[$type])) $grouped[$type] = [];
            $grouped[$type][] = $entry;
        }

        $lines = [];
        foreach ($grouped as $type_label => $items) {
            $lines[] = "{$type_label}:";
            foreach ($items as $item) {
                $url = "https://{$domain}/context/{$item['path']}.txt";
                $desc = $item['description'] ? " — {$item['description']}" : '';
                $lines[] = "  - {$item['title']}{$desc}";
                $lines[] = "    {$url}";
            }
            $lines[] = '';
        }

        return "## section: Site Map\n\n" . trim(implode("\n", $lines));
    }

    /**
     * Discover all publishable content entries.
     * Uses sitemap.xml first, then falls back to DB queries.
     */
    private function discover_all_entries(): array {
        $entries = [];

        // Get all public post types
        $post_types = get_post_types(['public' => true], 'objects');
        unset($post_types['attachment']);

        foreach ($post_types as $pt) {
            $posts = get_posts([
                'post_type'      => $pt->name,
                'post_status'    => 'publish',
                'posts_per_page' => 100,
                'orderby'        => 'menu_order date',
                'order'          => 'ASC',
            ]);

            foreach ($posts as $post) {
                if ($this->is_excluded($post)) continue;

                // Build the path
                $path = $this->get_context_path($post);

                // Get a short description
                $desc = '';
                if ($post->post_excerpt) {
                    $desc = $this->clean_text($post->post_excerpt);
                } else {
                    $content = $this->clean_text($post->post_content);
                    if ($content) {
                        $desc = mb_substr($content, 0, 120);
                        if (mb_strlen($content) > 120) $desc .= '...';
                        $desc = str_replace("\n", ' ', $desc);
                    }
                }

                $type_label = $pt->labels->singular_name ?? ucfirst($pt->name);

                $entries[] = [
                    'title'       => $post->post_title,
                    'path'        => $path,
                    'type'        => $pt->name,
                    'type_label'  => $pt->labels->name ?? ucfirst($pt->name),
                    'description' => $desc,
                ];
            }
        }

        // WooCommerce categories
        if ($this->is_woocommerce_active()) {
            $product_cats = get_terms([
                'taxonomy'   => 'product_cat',
                'hide_empty' => true,
                'exclude'    => [get_option('default_product_cat', 0)],
            ]);

            if (!is_wp_error($product_cats) && !empty($product_cats)) {
                foreach ($product_cats as $cat) {
                    $entries[] = [
                        'title'       => $cat->name,
                        'path'        => 'shop/' . $cat->slug,
                        'type'        => 'product_cat',
                        'type_label'  => 'Shop Categories',
                        'description' => $cat->description
                            ? mb_substr($this->clean_text($cat->description), 0, 120)
                            : "{$cat->count} products",
                    ];
                }
            }
        }

        return $entries;
    }

    /**
     * Get the context URL path for a post.
     * Pages: /context/{slug}.txt or /context/{parent}/{slug}.txt
     * Posts: /context/blog/{slug}.txt
     * CPT:   /context/{post_type}/{slug}.txt
     * Products: /context/products/{slug}.txt
     */
    private function get_context_path($post): string {
        $slug = $post->post_name;

        switch ($post->post_type) {
            case 'page':
                // Check for parent page
                if ($post->post_parent) {
                    $parent = get_post($post->post_parent);
                    if ($parent) {
                        return $parent->post_name . '/' . $slug;
                    }
                }
                return $slug;

            case 'post':
                return 'blog/' . $slug;

            case 'product':
                return 'products/' . $slug;

            default:
                return $post->post_type . '/' . $slug;
        }
    }

    // =========================================================================
    //  SINGLE PAGE GENERATION
    // =========================================================================

    /**
     * Build a full context.txt for a single post/page.
     */
    private function build_page_context($post): string {
        $parts = [];
        $domain = wp_parse_url(home_url(), PHP_URL_HOST);
        $path = $this->get_context_path($post);

        // Header: page title + excerpt as description
        $title = $post->post_title;
        $desc = $post->post_excerpt
            ? $this->clean_text($post->post_excerpt)
            : $this->get_short_description($post);

        if (mb_strlen($desc) > 160) {
            $desc = mb_substr($desc, 0, 157) . '...';
        }

        $parts[] = "# {$title}\n> {$desc}";

        // Metadata
        $lang = $this->settings['lang'] ?? substr(get_locale(), 0, 2);
        $date = get_the_modified_date('Y-m-d', $post) ?: current_time('Y-m-d');

        $meta = "@lang: {$lang}\n";
        $meta .= "@version: 1.0\n";
        $meta .= "@updated: {$date}\n";
        $meta .= "@canonical: https://{$domain}/context/{$path}.txt";

        // PCE: content_type based on post type
        $content_type = $this->detect_content_type($post);
        $meta .= "\n@content_type: {$content_type}";

        // PCE: industry metadata (auto-detected or from settings)
        $industry = $this->detect_industry();
        if ($industry) {
            $meta .= "\n@industry: {$industry}";
        }

        // PCE: currency for ecommerce sites
        if ($this->is_woocommerce_active()) {
            $meta .= "\n@currency: " . get_woocommerce_currency();
        }

        // Topics from categories/tags
        $topics = $this->get_post_topics($post);
        if ($topics) {
            $meta .= "\n@topics: {$topics}";
        }

        $parts[] = $meta;

        // Main content section
        $content = $this->get_rendered_content($post);
        if ($content) {
            // Split long content into multiple sections intelligently
            $content_sections = $this->split_into_sections($content, $title);
            foreach ($content_sections as $section) {
                $parts[] = $section;
            }
        }

        // For products: add specific sections
        if ($post->post_type === 'product' && $this->is_woocommerce_active()) {
            $product_sections = $this->build_product_sections($post->ID);
            foreach ($product_sections as $section) {
                $parts[] = $section;
            }
        }

        // Child pages (if this is a parent page)
        $children = $this->get_child_pages_section($post);
        if ($children) $parts[] = $children;

        $output = implode("\n\n", array_filter($parts));

        if (strlen($output) > $this->max_total_bytes) {
            $output = substr($output, 0, $this->max_total_bytes);
        }

        return $output;
    }

    /**
     * Split long content into logical sections.
     * Uses headings (h2, h3) in the content as section dividers.
     */
    private function split_into_sections(string $content, string $page_title): array {
        $sections = [];

        // Try to split on what look like headings or major breaks
        // Pattern: lines that are short, followed by longer content
        $lines = explode("\n", $content);
        $current_title = $page_title;
        $current_body = [];

        foreach ($lines as $line) {
            $trimmed = trim($line);

            // Detect heading-like lines: short, no punctuation at end, followed by content
            $is_heading = (
                mb_strlen($trimmed) > 3 &&
                mb_strlen($trimmed) < 80 &&
                !preg_match('/[.,:;!?]$/', $trimmed) &&
                !str_starts_with($trimmed, '-') &&
                !str_starts_with($trimmed, '•') &&
                mb_strtoupper($trimmed) === $trimmed || // ALL CAPS
                preg_match('/^[A-Z\x{00C0}-\x{024F}][a-z\x{00E0}-\x{024F}]+(\s[A-Z\x{00C0}-\x{024F}]?[a-z\x{00E0}-\x{024F}]*)*$/u', $trimmed) // Title Case
            );

            if ($is_heading && !empty($current_body)) {
                // Save previous section
                $body_text = $this->truncate(trim(implode("\n", $current_body)));
                if (mb_strlen($body_text) > 30) {
                    $sections[] = "## section: {$current_title}\n\n{$body_text}";
                }
                $current_title = $trimmed;
                $current_body = [];
            } else {
                $current_body[] = $line;
            }
        }

        // Save last section
        $body_text = $this->truncate(trim(implode("\n", $current_body)));
        if (mb_strlen($body_text) > 30) {
            $sections[] = "## section: {$current_title}\n\n{$body_text}";
        }

        // If no sections were split, just make one
        if (empty($sections)) {
            $content = $this->truncate($content);
            $sections[] = "## section: {$page_title}\n\n{$content}";
        }

        return $sections;
    }

    /**
     * Build WooCommerce product sections using PCE (ProtoContext Extension) format.
     *
     * Outputs structured blocks with PRODUCT_ID, PRICE, CURRENCY, CATEGORY,
     * PURCHASE_URL, ACTION, etc. so AI agents can understand and act on products.
     */
    private function build_product_sections(int $product_id): array {
        $sections = [];
        $product = wc_get_product($product_id);
        if (!$product) return $sections;

        $currency = get_woocommerce_currency();

        // --- PCE Product Details block ---
        $lines = [];
        $lines[] = "PRODUCT_ID: " . ($product->get_sku() ?: "wc-{$product_id}");
        $lines[] = "PRICE: " . $product->get_price();
        $lines[] = "CURRENCY: {$currency}";

        if ($product->is_on_sale()) {
            $lines[] = "REGULAR_PRICE: " . $product->get_regular_price();
            $lines[] = "SALE_PRICE: " . $product->get_sale_price();
        }

        $lines[] = "STOCK_STATUS: " . ($product->is_in_stock() ? 'in_stock' : 'out_of_stock');

        $stock_qty = $product->get_stock_quantity();
        if ($stock_qty !== null) {
            $lines[] = "STOCK_QUANTITY: {$stock_qty}";
        }

        // Categories
        $cats = wp_get_post_terms($product_id, 'product_cat', ['fields' => 'names']);
        if (!is_wp_error($cats) && !empty($cats)) {
            $lines[] = "CATEGORY: " . implode(', ', $cats);
        }

        // Tags
        $tags = wp_get_post_terms($product_id, 'product_tag', ['fields' => 'names']);
        if (!is_wp_error($tags) && !empty($tags)) {
            $lines[] = "TAGS: " . implode(', ', $tags);
        }

        // Weight & Dimensions
        if ($product->get_weight()) {
            $lines[] = "WEIGHT: " . $product->get_weight() . ' ' . get_option('woocommerce_weight_unit');
        }
        $dims = wc_format_dimensions($product->get_dimensions(false));
        if ($dims && $dims !== 'N/A') {
            $lines[] = "DIMENSIONS: {$dims}";
        }

        // Action URLs
        $lines[] = "PURCHASE_URL: " . $product->get_permalink();
        $lines[] = "ACTION: product_purchase";

        // Images
        $image_id = $product->get_image_id();
        if ($image_id) {
            $image_url = wp_get_attachment_url($image_id);
            if ($image_url) $lines[] = "IMAGE_URL: {$image_url}";
        }

        $sections[] = "## section: Product Details\n\n" . implode("\n", $lines);

        // --- Attributes / Specifications ---
        $attributes = $product->get_attributes();
        if (!empty($attributes)) {
            $attr_lines = [];
            foreach ($attributes as $attr) {
                $name = wc_attribute_label($attr->get_name());
                $values = $attr->is_taxonomy()
                    ? implode(', ', wc_get_product_terms($product_id, $attr->get_name(), ['fields' => 'names']))
                    : implode(', ', $attr->get_options());
                $attr_lines[] = "{$name}: {$values}";
            }
            if ($attr_lines) {
                $sections[] = "## section: Specifications\n\n" . implode("\n", $attr_lines);
            }
        }

        // --- Variable product: list variations ---
        if ($product->is_type('variable')) {
            $variation_sections = $this->build_variation_sections($product);
            $sections = array_merge($sections, $variation_sections);
        }

        // --- Related / Upsell products ---
        $related = $this->build_related_products_section($product);
        if ($related) $sections[] = $related;

        return $sections;
    }

    /**
     * Build PCE sections for each variation of a variable product.
     */
    private function build_variation_sections(\WC_Product_Variable $product): array {
        $sections = [];
        $variations = $product->get_available_variations();
        $currency = get_woocommerce_currency();

        if (empty($variations)) return $sections;

        $lines = [];
        foreach ($variations as $v) {
            $variation = wc_get_product($v['variation_id']);
            if (!$variation) continue;

            $attrs = [];
            foreach ($v['attributes'] as $attr_key => $attr_val) {
                $label = wc_attribute_label(str_replace('attribute_', '', $attr_key));
                $attrs[] = "{$label}: {$attr_val}";
            }
            $attr_str = implode(' | ', $attrs);

            $line = "- {$attr_str}";
            $line .= " — {$currency} " . $variation->get_price();
            if ($variation->get_sku()) $line .= " (SKU: {$variation->get_sku()})";
            $line .= $variation->is_in_stock() ? ' [In stock]' : ' [Out of stock]';
            $lines[] = $line;
        }

        if ($lines) {
            $sections[] = "## section: Available Variations\n\n" . implode("\n", $lines);
        }

        return $sections;
    }

    /**
     * Build a section listing related/upsell products with links.
     */
    private function build_related_products_section(\WC_Product $product): ?string {
        $domain = wp_parse_url(home_url(), PHP_URL_HOST);
        $lines = [];

        // Upsells
        $upsell_ids = $product->get_upsell_ids();
        foreach (array_slice($upsell_ids, 0, 5) as $id) {
            $p = wc_get_product($id);
            if (!$p || $p->get_status() !== 'publish') continue;
            $lines[] = "- {$p->get_name()} — " . strip_tags(wc_price($p->get_price()));
            $lines[] = "  https://{$domain}/context/products/{$p->get_slug()}.txt";
        }

        // Cross-sells
        $cross_ids = $product->get_cross_sell_ids();
        foreach (array_slice($cross_ids, 0, 5) as $id) {
            $p = wc_get_product($id);
            if (!$p || $p->get_status() !== 'publish') continue;
            if (in_array($id, $upsell_ids)) continue;
            $lines[] = "- {$p->get_name()} — " . strip_tags(wc_price($p->get_price()));
            $lines[] = "  https://{$domain}/context/products/{$p->get_slug()}.txt";
        }

        if (empty($lines)) return null;
        return "## section: Related Products\n\n" . implode("\n", $lines);
    }

    /**
     * Build a full context.txt for a WooCommerce product category.
     * Lists all products in the category with PCE structured data.
     */
    private function build_category_context(string $category_slug): ?string {
        $term = get_term_by('slug', $category_slug, 'product_cat');
        if (!$term || is_wp_error($term)) return null;

        $domain = wp_parse_url(home_url(), PHP_URL_HOST);
        $lang = $this->settings['lang'] ?? substr(get_locale(), 0, 2);
        $date = current_time('Y-m-d');
        $currency = get_woocommerce_currency();

        $parts = [];

        // Header
        $parts[] = "# {$term->name}";
        if ($term->description) {
            $desc = $this->clean_text($term->description);
            if (mb_strlen($desc) > 160) $desc = mb_substr($desc, 0, 157) . '...';
            $parts[0] .= "\n> {$desc}";
        }

        // Metadata
        $meta = "@lang: {$lang}\n@version: 1.0\n@updated: {$date}";
        $meta .= "\n@canonical: https://{$domain}/context/shop/{$category_slug}.txt";
        $meta .= "\n@content_type: ecommerce";
        $meta .= "\n@industry: ecommerce";
        $meta .= "\n@currency: {$currency}";
        $parts[] = $meta;

        // List products in this category
        $products = get_posts([
            'post_type'      => 'product',
            'post_status'    => 'publish',
            'posts_per_page' => 50,
            'tax_query'      => [[
                'taxonomy' => 'product_cat',
                'field'    => 'slug',
                'terms'    => $category_slug,
            ]],
        ]);

        if (!empty($products)) {
            $product_lines = [];
            foreach ($products as $p) {
                $wc_product = wc_get_product($p->ID);
                if (!$wc_product) continue;

                $line = "PRODUCT_ID: " . ($wc_product->get_sku() ?: "wc-{$p->ID}");
                $line .= "\nNAME: {$p->post_title}";
                $line .= "\nPRICE: {$wc_product->get_price()}";
                $line .= "\nCURRENCY: {$currency}";
                $line .= "\nSTOCK_STATUS: " . ($wc_product->is_in_stock() ? 'in_stock' : 'out_of_stock');
                $line .= "\nPURCHASE_URL: {$wc_product->get_permalink()}";
                $line .= "\nDETAILS_URL: https://{$domain}/context/products/{$p->post_name}.txt";
                $line .= "\nACTION: product_purchase";

                $short_desc = $p->post_excerpt ? $this->clean_text($p->post_excerpt) : '';
                if ($short_desc) {
                    if (mb_strlen($short_desc) > 120) $short_desc = mb_substr($short_desc, 0, 117) . '...';
                    $line .= "\n{$short_desc}";
                }

                $product_lines[] = $line;
            }
            $sections_text = implode("\n\n", $product_lines);
            $parts[] = "## section: Products\n\n{$sections_text}";
        }

        // Sub-categories
        $subcats = get_terms([
            'taxonomy'   => 'product_cat',
            'parent'     => $term->term_id,
            'hide_empty' => true,
        ]);
        if (!empty($subcats) && !is_wp_error($subcats)) {
            $sub_lines = [];
            foreach ($subcats as $sub) {
                $sub_lines[] = "- {$sub->name} ({$sub->count} products)";
                $sub_lines[] = "  https://{$domain}/context/shop/{$sub->slug}.txt";
            }
            $parts[] = "## section: Sub-categories\n\n" . implode("\n", $sub_lines);
        }

        return implode("\n\n", array_filter($parts));
    }

    /**
     * Get child pages as a section.
     */
    private function get_child_pages_section($post): ?string {
        if ($post->post_type !== 'page') return null;

        $children = get_pages([
            'parent'      => $post->ID,
            'post_status' => 'publish',
            'sort_column' => 'menu_order',
        ]);

        if (empty($children)) return null;

        $domain = wp_parse_url(home_url(), PHP_URL_HOST);
        $lines = [];
        foreach ($children as $child) {
            $path = $post->post_name . '/' . $child->post_name;
            $desc = $child->post_excerpt ? " — " . $this->clean_text($child->post_excerpt) : '';
            $lines[] = "- {$child->post_title}{$desc}";
            $lines[] = "  https://{$domain}/context/{$path}.txt";
        }

        return "## section: Sub-pages\n\n" . implode("\n", $lines);
    }

    // =========================================================================
    //  MANUAL MODE
    // =========================================================================

    private function generate_manual_page(string $slug): ?string {
        $sections = get_option('protocontext_sections', []);
        foreach ($sections as $section) {
            $section_slug = sanitize_title($section['title'] ?? '');
            if ($section_slug === $slug && !empty($section['body'])) {
                $parts = [];
                $parts[] = $this->build_header();
                $parts[] = $this->build_metadata();
                $body = $this->clean_text($section['body']);
                $parts[] = "## section: {$section['title']}\n\n{$body}";
                return implode("\n\n", $parts);
            }
        }
        return null;
    }

    // =========================================================================
    //  HELPERS
    // =========================================================================

    private function build_header(): string {
        $name = $this->settings['site_name'] ?? get_bloginfo('name');
        $desc = $this->settings['description'] ?? get_bloginfo('description');
        if (mb_strlen($desc) > 160) $desc = mb_substr($desc, 0, 157) . '...';
        return "# {$name}\n> {$desc}";
    }

    private function build_metadata(): string {
        $lang = $this->settings['lang'] ?? substr(get_locale(), 0, 2);
        $domain = wp_parse_url(home_url(), PHP_URL_HOST);
        $topics = $this->settings['topics'] ?? '';
        $date = current_time('Y-m-d');

        $meta = "@lang: {$lang}\n@version: 1.0\n@updated: {$date}\n@canonical: https://{$domain}/context.txt";

        // PCE: industry metadata
        $industry = $this->detect_industry();
        if ($industry) {
            $meta .= "\n@industry: {$industry}";
            $meta .= "\n@content_type: {$industry}";
        } else {
            $meta .= "\n@content_type: website";
        }

        // PCE: currency for ecommerce sites
        if ($this->is_woocommerce_active()) {
            $meta .= "\n@currency: " . get_woocommerce_currency();
        }

        if (!empty($topics)) $meta .= "\n@topics: {$topics}";
        return $meta;
    }

    /**
     * Find a post by slug and optional type.
     */
    private function find_post(string $slug, string $type = ''): ?\WP_Post {
        // Type mapping from URL path to post_type
        $type_map = [
            'blog'     => 'post',
            'products' => 'product',
        ];

        $post_type = 'any';
        $parent_slug = '';

        if ($type) {
            // /context/{type}/{slug}.txt
            if (isset($type_map[$type])) {
                $post_type = $type_map[$type];
            } else {
                // Could be a parent page slug
                $parent = get_page_by_path($type);
                if ($parent) {
                    // This is /context/{parent}/{child}.txt
                    $post_type = 'page';
                    $parent_slug = $type;
                } else {
                    // Try as custom post type
                    if (post_type_exists($type)) {
                        $post_type = $type;
                    }
                }
            }
        }

        // Try get_page_by_path first (handles nested slugs)
        if ($parent_slug) {
            $full_path = $parent_slug . '/' . $slug;
            $page = get_page_by_path($full_path);
            if ($page && $page->post_status === 'publish') return $page;
        }

        // Query by slug
        $args = [
            'name'        => $slug,
            'post_status' => 'publish',
            'numberposts' => 1,
        ];

        if ($post_type !== 'any') {
            $args['post_type'] = $post_type;
        } else {
            $args['post_type'] = get_post_types(['public' => true], 'names');
        }

        $posts = get_posts($args);
        return !empty($posts) ? $posts[0] : null;
    }

    private function is_excluded($post): bool {
        return in_array($post->post_name, $this->exclude_slugs, true);
    }

    private function get_short_description($post): string {
        $content = $this->get_rendered_content($post);
        $first_line = strtok($content, "\n");
        if (mb_strlen($first_line) > 10) return $first_line;
        return mb_substr($content, 0, 160);
    }

    private function get_post_topics($post): string {
        $topics = [];

        // Categories
        $cats = get_the_category($post->ID);
        if ($cats) {
            foreach ($cats as $cat) {
                if ($cat->slug !== 'uncategorized') $topics[] = $cat->name;
            }
        }

        // Tags
        $tags = get_the_tags($post->ID);
        if ($tags) {
            foreach ($tags as $tag) {
                $topics[] = $tag->name;
            }
        }

        // WooCommerce categories
        if ($post->post_type === 'product') {
            $product_cats = wp_get_post_terms($post->ID, 'product_cat', ['fields' => 'names']);
            if (!is_wp_error($product_cats)) {
                $topics = array_merge($topics, $product_cats);
            }
        }

        return implode(', ', array_unique(array_slice($topics, 0, 10)));
    }

    // =========================================================================
    //  CONTENT RENDERING — handles all page builders
    // =========================================================================

    private function get_rendered_content($post): string {
        $raw = $post->post_content;

        // Elementor: extract from JSON metadata
        $elementor_data = get_post_meta($post->ID, '_elementor_data', true);
        if (!empty($elementor_data)) {
            $elementor_text = $this->extract_elementor_text($elementor_data);
            if (mb_strlen($elementor_text) > mb_strlen($this->clean_text($raw))) {
                $raw = $elementor_text;
            }
        }

        // ACF fields
        if (function_exists('get_fields')) {
            $acf_text = $this->extract_acf_fields($post->ID);
            if ($acf_text) $raw .= "\n" . $acf_text;
        }

        // Apply WP filters (shortcodes, Gutenberg, Divi, WPBakery)
        $rendered = apply_filters('the_content', $raw);

        return $this->clean_text($rendered);
    }

    private function extract_elementor_text(string $json): string {
        $data = json_decode($json, true);
        if (!is_array($data)) return '';
        $texts = [];
        $this->walk_elementor($data, $texts);
        return implode("\n", $texts);
    }

    private function walk_elementor(array $elements, array &$texts): void {
        foreach ($elements as $el) {
            if (isset($el['settings']) && is_array($el['settings'])) {
                $keys = ['title', 'description', 'editor', 'text', 'heading_title',
                         'title_text', 'description_text', 'content', 'inner_text',
                         'tab_title', 'tab_content', 'alert_title', 'alert_description',
                         'testimonial_content', 'testimonial_name', 'price',
                         'item_description', 'blockquote_content', 'html'];

                foreach ($keys as $k) {
                    if (!empty($el['settings'][$k]) && is_string($el['settings'][$k])) {
                        $t = $this->clean_text($el['settings'][$k]);
                        if (mb_strlen($t) > 3) $texts[] = $t;
                    }
                }

                // Lists
                if (!empty($el['settings']['icon_list']) && is_array($el['settings']['icon_list'])) {
                    foreach ($el['settings']['icon_list'] as $item) {
                        if (!empty($item['text'])) $texts[] = "- " . $this->clean_text($item['text']);
                    }
                }

                // Tabs / Accordions
                foreach (['tabs', 'accordion_items'] as $repeater) {
                    if (!empty($el['settings'][$repeater]) && is_array($el['settings'][$repeater])) {
                        foreach ($el['settings'][$repeater] as $tab) {
                            if (!empty($tab['tab_title'])) $texts[] = $this->clean_text($tab['tab_title']);
                            if (!empty($tab['tab_content'])) $texts[] = $this->clean_text($tab['tab_content']);
                        }
                    }
                }
            }

            if (!empty($el['elements']) && is_array($el['elements'])) {
                $this->walk_elementor($el['elements'], $texts);
            }
        }
    }

    private function extract_acf_fields(int $post_id): string {
        $fields = get_fields($post_id);
        if (empty($fields) || !is_array($fields)) return '';
        $texts = [];
        $this->walk_acf($fields, $texts);
        return implode("\n", $texts);
    }

    private function walk_acf($fields, array &$texts): void {
        foreach ($fields as $key => $value) {
            if (str_starts_with($key, '_')) continue;
            if (is_string($value) && mb_strlen($value) > 10 && mb_strlen($value) < 5000) {
                if (!preg_match('/^(https?:\/\/|\/|a:\d|O:\d)/', $value)) {
                    $t = $this->clean_text($value);
                    if (mb_strlen($t) > 10) $texts[] = $t;
                }
            } elseif (is_array($value)) {
                $this->walk_acf($value, $texts);
            }
        }
    }

    /**
     * PCE: Detect the content_type for a given post.
     */
    private function detect_content_type($post): string {
        switch ($post->post_type) {
            case 'product':
                return 'product';
            default:
                // If WooCommerce is active, non-product pages are "ecommerce" context
                if ($this->is_woocommerce_active()) {
                    // Shop-related pages
                    if (function_exists('wc_get_page_id')) {
                        $shop_pages = [
                            wc_get_page_id('shop'),
                            wc_get_page_id('cart'),
                            wc_get_page_id('checkout'),
                            wc_get_page_id('myaccount'),
                        ];
                        if (in_array($post->ID, $shop_pages)) {
                            return 'ecommerce';
                        }
                    }
                }
                return 'website';
        }
    }

    /**
     * PCE: Detect the industry for this site.
     * Returns the industry string or empty if not detectable.
     */
    private function detect_industry(): string {
        // Check explicit setting first
        $industry = $this->settings['industry'] ?? '';
        if ($industry) return $industry;

        // Auto-detect: WooCommerce → ecommerce
        if ($this->is_woocommerce_active()) {
            return 'ecommerce';
        }

        return '';
    }

    private function is_woocommerce_active(): bool {
        return class_exists('WooCommerce');
    }

    // =========================================================================
    //  TEXT CLEANING
    // =========================================================================

    private function clean_text(string $text): string {
        foreach ($this->builder_patterns as $pattern) {
            $text = preg_replace($pattern, '', $text);
        }
        $text = strip_shortcodes($text);
        $text = preg_replace('/<!--\s*\/?wp:[^>]*?-->/', '', $text);
        $text = preg_replace('/<style[^>]*>.*?<\/style>/si', '', $text);
        $text = preg_replace('/<script[^>]*>.*?<\/script>/si', '', $text);
        $text = preg_replace('/<br\s*\/?>/i', "\n", $text);
        $text = preg_replace('/<\/(p|div|h[1-6]|li|tr|blockquote)>/i', "\n", $text);
        $text = preg_replace('/<li[^>]*>/i', "- ", $text);
        $text = wp_strip_all_tags($text);
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        $text = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}\x{00A0}]/u', ' ', $text);
        $text = preg_replace('/[ \t]+/', ' ', $text);
        $text = preg_replace('/\n[ \t]+/', "\n", $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        return trim($text);
    }

    private function truncate(string $text): string {
        if (mb_strlen($text) <= $this->max_section_chars) return $text;
        $cut = mb_substr($text, 0, $this->max_section_chars);
        $last_period = mb_strrpos($cut, '.');
        $last_newline = mb_strrpos($cut, "\n");
        $break_at = max($last_period, $last_newline);
        if ($break_at > $this->max_section_chars * 0.5) {
            return mb_substr($text, 0, $break_at + 1);
        }
        return $cut . '...';
    }
}
