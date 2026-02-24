=== ProtoContext ===
Contributors: protocontext
Tags: ai, context, seo, structured-data, agents, woocommerce, pce
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.1.1-beta
License: Apache-2.0

Generates and serves a context.txt file so AI agents can understand your site instantly.

== Description ==

ProtoContext creates a `/context.txt` file on your WordPress site following the ProtoContext open standard with PCE (ProtoContext Extension) structured data.

Like `robots.txt` tells crawlers what to index, `context.txt` tells AI agents what your site is about — with real content, not just directives.

**Features:**

* Auto-generates context.txt from your pages, posts, and WooCommerce products
* PCE structured data: products, categories, actions, and metadata
* `@content_type` and `@industry` metadata for AI content classification
* Full WooCommerce integration: products, variations, categories, related products
* Manual mode for full control over each section
* Live preview in the admin panel
* Proper CORS headers for AI agent access
* 1-hour cache with auto-invalidation on save
* Industry auto-detection (ecommerce, hospitality, tours, etc.)

**WooCommerce PCE Output:**

Each product context file includes structured PCE blocks:

    PRODUCT_ID: sku-123
    PRICE: 29.99
    CURRENCY: USD
    STOCK_STATUS: in_stock
    CATEGORY: Electronics, Gadgets
    PURCHASE_URL: https://yoursite.com/product/widget/
    ACTION: product_purchase

**Routes:**

* `/context.txt` — sitemap index
* `/context/{slug}.txt` — individual page
* `/context/blog/{slug}.txt` — blog post
* `/context/products/{slug}.txt` — WooCommerce product (PCE format)
* `/context/shop/{category}.txt` — WooCommerce category listing

== Installation ==

1. Upload the `protocontext` folder to `/wp-content/plugins/`
2. Activate the plugin through the Plugins menu
3. Go to Settings → ProtoContext to configure
4. Your context.txt is now live at yourdomain.com/context.txt

== Frequently Asked Questions ==

= What is context.txt? =
It is a structured text file that tells AI agents what your website is about. Think of it as robots.txt for AI — but with actual content.

= What is PCE? =
PCE (ProtoContext Extension) adds structured data blocks to context.txt. For ecommerce, this means products include machine-readable fields like PRODUCT_ID, PRICE, PURCHASE_URL, and ACTION that AI agents can use to help users browse, compare, and purchase products.

= Do I need to configure anything? =
The plugin works out of the box in "Auto" mode. It will generate sections from your existing pages and posts. Switch to "Manual" mode for full control.

= Does it work with WooCommerce? =
Yes. It automatically detects WooCommerce products and generates PCE structured product data including pricing, variations, stock status, categories, and purchase URLs. Product categories also get their own context pages at `/context/shop/{category}.txt`.

= What industries are supported? =
The plugin auto-detects ecommerce (WooCommerce). You can manually set your industry in settings: ecommerce, hospitality, tours, restaurant, real estate, healthcare, or education.

== Changelog ==

= 1.1.0 =
* PCE (ProtoContext Extension) structured data output
* `@content_type` and `@industry` metadata on all context files
* Deep WooCommerce integration: PCE product blocks with PRODUCT_ID, PRICE, CURRENCY, STOCK_STATUS, PURCHASE_URL, ACTION
* Variable product support: lists all variations with attributes and pricing
* WooCommerce category pages at `/context/shop/{category}.txt`
* Related/upsell product sections
* Industry auto-detection (ecommerce for WooCommerce sites)
* Industry selector in admin settings
* `@currency` metadata for ecommerce sites

= 1.0.0 =
* Initial release
