<?php
/**
 * Plugin Name: ProtoContext
 * Plugin URI: https://protocontext.org
 * Description: Generates and serves a context.txt file for AI agents following the ProtoContext open standard.
 * Version: 0.1.1-beta
 * Author: ProtoContext
 * Author URI: 
 * License: Apache-2.0
 * Text Domain: protocontext
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PROTOCONTEXT_VERSION', '0.1.1-beta');
define('PROTOCONTEXT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PROTOCONTEXT_PLUGIN_URL', plugin_dir_url(__FILE__));

// Load includes
require_once PROTOCONTEXT_PLUGIN_DIR . 'includes/class-generator.php';
require_once PROTOCONTEXT_PLUGIN_DIR . 'includes/class-server.php';

// Load admin
if (is_admin()) {
    require_once PROTOCONTEXT_PLUGIN_DIR . 'admin/class-admin.php';
}

/**
 * Activation hook — flush rewrite rules so /context.txt works immediately
 */
function protocontext_activate() {
    ProtoContext_Server::register_rewrite_rules();
    flush_rewrite_rules();

    // Set defaults if not configured
    if (!get_option('protocontext_settings')) {
        $site_name = get_bloginfo('name');
        $site_desc = get_bloginfo('description');
        $lang = substr(get_locale(), 0, 2);

        update_option('protocontext_settings', [
            'site_name'   => $site_name,
            'description' => $site_desc,
            'lang'        => $lang ?: 'en',
            'topics'      => '',
            'mode'        => 'auto',
        ]);
    }
}
register_activation_hook(__FILE__, 'protocontext_activate');

/**
 * Deactivation hook
 */
function protocontext_deactivate() {
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'protocontext_deactivate');

/**
 * Initialize the plugin
 */
function protocontext_init() {
    ProtoContext_Server::init();
}
add_action('init', 'protocontext_init');
