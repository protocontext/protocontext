<?php
/**
 * ProtoContext Admin — settings page in WordPress dashboard.
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProtoContext_Admin {

    public function __construct() {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('update_option_protocontext_settings', [$this, 'on_settings_update'], 10, 0);
        add_action('update_option_protocontext_sections', [$this, 'on_settings_update'], 10, 0);
        add_action('wp_ajax_protocontext_preview', [$this, 'ajax_preview']);
    }

    /**
     * Add menu item under Settings.
     */
    public function add_menu() {
        add_options_page(
            'ProtoContext',
            'ProtoContext',
            'manage_options',
            'protocontext',
            [$this, 'render_page']
        );
    }

    /**
     * Register settings.
     */
    public function register_settings() {
        register_setting('protocontext_group', 'protocontext_settings', [
            'sanitize_callback' => [$this, 'sanitize_settings'],
        ]);
        register_setting('protocontext_group', 'protocontext_sections', [
            'sanitize_callback' => [$this, 'sanitize_sections'],
        ]);
    }

    /**
     * Enqueue admin CSS and JS.
     */
    public function enqueue_assets($hook) {
        if ($hook !== 'settings_page_protocontext') {
            return;
        }
        wp_enqueue_style(
            'protocontext-admin',
            PROTOCONTEXT_PLUGIN_URL . 'assets/admin.css',
            [],
            PROTOCONTEXT_VERSION
        );
        wp_enqueue_script(
            'protocontext-admin',
            PROTOCONTEXT_PLUGIN_URL . 'assets/admin.js',
            ['jquery'],
            PROTOCONTEXT_VERSION,
            true
        );
        wp_localize_script('protocontext-admin', 'protocontextAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('protocontext_nonce'),
        ]);
    }

    /**
     * Invalidate cache on save.
     */
    public function on_settings_update() {
        ProtoContext_Server::invalidate_cache();
    }

    /**
     * Sanitize settings input.
     */
    public function sanitize_settings($input) {
        $valid_industries = ['', 'ecommerce', 'hospitality', 'tours', 'restaurant', 'realestate', 'healthcare', 'education'];
        $industry = sanitize_text_field($input['industry'] ?? '');

        return [
            'site_name'   => sanitize_text_field($input['site_name'] ?? ''),
            'description' => sanitize_text_field($input['description'] ?? ''),
            'lang'        => sanitize_text_field($input['lang'] ?? 'en'),
            'topics'      => sanitize_text_field($input['topics'] ?? ''),
            'industry'    => in_array($industry, $valid_industries) ? $industry : '',
            'mode'        => in_array($input['mode'] ?? '', ['auto', 'manual']) ? $input['mode'] : 'auto',
        ];
    }

    /**
     * Sanitize manual sections.
     */
    public function sanitize_sections($input) {
        if (!is_array($input)) return [];

        $clean = [];
        foreach ($input as $section) {
            if (empty($section['title'])) continue;
            $clean[] = [
                'title' => sanitize_text_field($section['title']),
                'body'  => sanitize_textarea_field($section['body'] ?? ''),
            ];
        }
        return $clean;
    }

    /**
     * AJAX: return a preview of the generated context.txt.
     */
    public function ajax_preview() {
        check_ajax_referer('protocontext_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        ProtoContext_Server::invalidate_cache();
        $generator = new ProtoContext_Generator();
        $content = $generator->generate();

        wp_send_json_success(['content' => $content]);
    }

    /**
     * Render the admin page.
     */
    public function render_page() {
        $settings = get_option('protocontext_settings', []);
        $sections = get_option('protocontext_sections', []);
        $domain = wp_parse_url(home_url(), PHP_URL_HOST);

        $site_name   = $settings['site_name'] ?? get_bloginfo('name');
        $description = $settings['description'] ?? get_bloginfo('description');
        $lang        = $settings['lang'] ?? substr(get_locale(), 0, 2);
        $topics      = $settings['topics'] ?? '';
        $industry    = $settings['industry'] ?? '';
        $mode        = $settings['mode'] ?? 'auto';
        $has_woo     = class_exists('WooCommerce');
        ?>
        <div class="wrap protocontext-wrap">
            <div class="protocontext-header">
                <h1>ProtoContext</h1>
                <p class="protocontext-subtitle">AI-readable content for your website — served at <a href="<?php echo esc_url(home_url('/context.txt')); ?>" target="_blank"><code><?php echo esc_html($domain); ?>/context.txt</code></a></p>
            </div>

            <div class="protocontext-layout">
                <div class="protocontext-main">
                    <form method="post" action="options.php">
                        <?php settings_fields('protocontext_group'); ?>

                        <!-- Header Settings -->
                        <div class="protocontext-card">
                            <h2>Header & Metadata</h2>

                            <table class="form-table">
                                <tr>
                                    <th><label for="site_name">Site Name</label></th>
                                    <td>
                                        <input type="text" id="site_name" name="protocontext_settings[site_name]"
                                               value="<?php echo esc_attr($site_name); ?>" class="regular-text" />
                                        <p class="description">Appears as <code># Site Name</code> in context.txt</p>
                                    </td>
                                </tr>
                                <tr>
                                    <th><label for="description">Description</label></th>
                                    <td>
                                        <input type="text" id="description" name="protocontext_settings[description]"
                                               value="<?php echo esc_attr($description); ?>" class="large-text"
                                               maxlength="160" />
                                        <p class="description">One-line description (max 160 chars). Appears as <code>> description</code></p>
                                    </td>
                                </tr>
                                <tr>
                                    <th><label for="lang">Language</label></th>
                                    <td>
                                        <input type="text" id="lang" name="protocontext_settings[lang]"
                                               value="<?php echo esc_attr($lang); ?>" class="small-text"
                                               maxlength="5" placeholder="en" />
                                        <p class="description">ISO 639-1 code (en, it, es, fr, de...)</p>
                                    </td>
                                </tr>
                                <tr>
                                    <th><label for="topics">Topics</label></th>
                                    <td>
                                        <input type="text" id="topics" name="protocontext_settings[topics]"
                                               value="<?php echo esc_attr($topics); ?>" class="large-text"
                                               placeholder="topic1, topic2, topic3" />
                                        <p class="description">Comma-separated topics for AI discovery</p>
                                    </td>
                                </tr>
                                <tr>
                                    <th><label for="industry">Industry</label></th>
                                    <td>
                                        <select id="industry" name="protocontext_settings[industry]">
                                            <option value="" <?php selected($industry, ''); ?>>
                                                <?php echo $has_woo ? 'Auto-detect (ecommerce)' : 'None (generic website)'; ?>
                                            </option>
                                            <option value="ecommerce" <?php selected($industry, 'ecommerce'); ?>>Ecommerce</option>
                                            <option value="hospitality" <?php selected($industry, 'hospitality'); ?>>Hospitality</option>
                                            <option value="tours" <?php selected($industry, 'tours'); ?>>Tours & Experiences</option>
                                            <option value="restaurant" <?php selected($industry, 'restaurant'); ?>>Restaurant</option>
                                            <option value="realestate" <?php selected($industry, 'realestate'); ?>>Real Estate</option>
                                            <option value="healthcare" <?php selected($industry, 'healthcare'); ?>>Healthcare</option>
                                            <option value="education" <?php selected($industry, 'education'); ?>>Education</option>
                                        </select>
                                        <p class="description">
                                            Sets <code>@industry</code> metadata for AI content classification (PCE).
                                            <?php if ($has_woo): ?>
                                                <br><strong>WooCommerce detected</strong> — auto-detects as "ecommerce" if left blank.
                                            <?php endif; ?>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <!-- Mode -->
                        <div class="protocontext-card">
                            <h2>Content Mode</h2>
                            <fieldset>
                                <label>
                                    <input type="radio" name="protocontext_settings[mode]" value="auto"
                                           <?php checked($mode, 'auto'); ?> />
                                    <strong>Auto</strong> — generates sections from your pages, posts, and products automatically
                                </label>
                                <br><br>
                                <label>
                                    <input type="radio" name="protocontext_settings[mode]" value="manual"
                                           <?php checked($mode, 'manual'); ?> />
                                    <strong>Manual</strong> — you define each section yourself (full control)
                                </label>
                            </fieldset>
                        </div>

                        <!-- Manual Sections -->
                        <div class="protocontext-card protocontext-manual-sections" style="<?php echo $mode === 'manual' ? '' : 'display:none;'; ?>">
                            <h2>Sections</h2>
                            <p class="description">Each section becomes a <code>## section: Title</code> block. Keep each under ~1000 characters.</p>

                            <div id="protocontext-sections-list">
                                <?php if (!empty($sections)): ?>
                                    <?php foreach ($sections as $i => $section): ?>
                                        <div class="protocontext-section-item" data-index="<?php echo $i; ?>">
                                            <div class="section-header">
                                                <input type="text"
                                                       name="protocontext_sections[<?php echo $i; ?>][title]"
                                                       value="<?php echo esc_attr($section['title']); ?>"
                                                       placeholder="Section Title" class="regular-text" />
                                                <button type="button" class="button protocontext-remove-section">Remove</button>
                                            </div>
                                            <textarea name="protocontext_sections[<?php echo $i; ?>][body]"
                                                      rows="5" class="large-text"
                                                      placeholder="Section content... Plain text, no HTML."><?php echo esc_textarea($section['body']); ?></textarea>
                                            <span class="char-count">0 / 1000 chars</span>
                                        </div>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </div>

                            <button type="button" id="protocontext-add-section" class="button button-secondary">+ Add Section</button>
                        </div>

                        <?php submit_button('Save & Regenerate'); ?>
                    </form>
                </div>

                <!-- Preview Sidebar -->
                <div class="protocontext-sidebar">
                    <div class="protocontext-card">
                        <h2>Preview</h2>
                        <button type="button" id="protocontext-preview-btn" class="button button-secondary">Refresh Preview</button>
                        <pre id="protocontext-preview" class="protocontext-preview-box">Click "Refresh Preview" to see your context.txt</pre>
                    </div>

                    <div class="protocontext-card">
                        <h2>Quick Info</h2>
                        <ul class="protocontext-info">
                            <li>Your file: <a href="<?php echo esc_url(home_url('/context.txt')); ?>" target="_blank"><?php echo esc_html($domain); ?>/context.txt</a></li>
                            <li>Standard: <a href="https://protocontext.org" target="_blank">protocontext.org</a></li>
                            <li>Format: PCE (ProtoContext Extension)</li>
                            <li>Cache: refreshes every hour</li>
                            <li>Saving settings refreshes immediately</li>
                            <?php if ($has_woo): ?>
                                <li><strong>WooCommerce:</strong> Active — products export with PCE structured data (PRODUCT_ID, PRICE, PURCHASE_URL)</li>
                            <?php endif; ?>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
}

// Initialize
new ProtoContext_Admin();
