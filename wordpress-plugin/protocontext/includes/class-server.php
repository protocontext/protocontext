<?php
/**
 * ProtoContext Server — serves context.txt files.
 *
 * Routes:
 *   /context.txt           → sitemap index (lists all available context files)
 *   /context/{slug}.txt    → individual page/post context file
 *   /context/{slug}/{child}.txt → child page context file
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProtoContext_Server {

    public static function init() {
        self::register_rewrite_rules();
        add_filter('query_vars', [__CLASS__, 'add_query_vars']);
        add_action('template_redirect', [__CLASS__, 'handle_request']);
    }

    /**
     * Register rewrite rules for all context.txt routes.
     */
    public static function register_rewrite_rules() {
        // /context.txt → sitemap index
        add_rewrite_rule(
            '^context\.txt$',
            'index.php?protocontext=index',
            'top'
        );

        // /context/{type}/{slug}.txt → specific post by type and slug
        add_rewrite_rule(
            '^context/([^/]+)/([^/]+)\.txt$',
            'index.php?protocontext=page&protocontext_type=$matches[1]&protocontext_slug=$matches[2]',
            'top'
        );

        // /context/{slug}.txt → page/post by slug
        add_rewrite_rule(
            '^context/([^/]+)\.txt$',
            'index.php?protocontext=page&protocontext_slug=$matches[1]',
            'top'
        );
    }

    public static function add_query_vars($vars) {
        $vars[] = 'protocontext';
        $vars[] = 'protocontext_slug';
        $vars[] = 'protocontext_type';
        return $vars;
    }

    public static function handle_request() {
        $action = get_query_var('protocontext');
        if (!$action) return;

        if ($action === 'index') {
            self::serve_index();
        } elseif ($action === 'page') {
            $slug = get_query_var('protocontext_slug');
            $type = get_query_var('protocontext_type');
            self::serve_page($slug, $type);
        }
    }

    /**
     * Serve the sitemap index: /context.txt
     */
    private static function serve_index() {
        $cache_key = 'protocontext_index';
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            self::output($cached);
            return;
        }

        $generator = new ProtoContext_Generator();
        $content = $generator->generate_index();

        set_transient($cache_key, $content, HOUR_IN_SECONDS);
        self::output($content);
    }

    /**
     * Serve an individual page context: /context/{slug}.txt
     */
    private static function serve_page(string $slug, string $type = '') {
        if (empty($slug)) {
            self::not_found();
            return;
        }

        $cache_key = "protocontext_page_{$type}_{$slug}";
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            self::output($cached);
            return;
        }

        $generator = new ProtoContext_Generator();
        $content = $generator->generate_page($slug, $type);

        if ($content === null) {
            self::not_found();
            return;
        }

        set_transient($cache_key, $content, HOUR_IN_SECONDS);
        self::output($content);
    }

    private static function output(string $content) {
        header('Content-Type: text/plain; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Cache-Control: public, max-age=3600');
        header('X-ProtoContext-Version: ' . PROTOCONTEXT_VERSION);
        echo $content;
        exit;
    }

    private static function not_found() {
        status_header(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo "# 404\n> This context page does not exist.\n\nUse /context.txt to see the sitemap of all available context files.";
        exit;
    }

    /**
     * Invalidate all caches.
     */
    public static function invalidate_cache() {
        global $wpdb;
        // Delete all protocontext transients
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_protocontext_%'");
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_protocontext_%'");
    }
}
