# Changelog

All notable changes to ProtoContext will be documented in this file.

## [0.1.1-beta] - 2026-02-24

### Added
- **PCE (ProtoContext Extension)**: Structured data blocks for products, rooms, tours, actions, policies
- **Unified `content_type` system**: Single field for all content classification (replaces separate industry/content_type)
- **WooCommerce deep integration** (WordPress plugin): PCE product blocks with PRODUCT_ID, PRICE, CURRENCY, STOCK_STATUS, PURCHASE_URL, ACTION
- **Variable product support**: Lists all WooCommerce variations with attributes and pricing
- **WooCommerce category pages**: `/context/shop/{category}.txt` route
- **Industry auto-detection**: Auto-detects ecommerce (WooCommerce), configurable for hospitality, tours, etc.
- **`@content_type` and `@industry` metadata** on all context files
- **`@currency` metadata** for ecommerce sites
- **Registry sync on startup**: Cleans stale domains not found in Typesense
- **Multi-provider AI support**: Gemini, OpenAI, or OpenRouter for content conversion
- **OpenRouter integration**: Access hundreds of AI models with a single API key
- **Sitemap scraping**: Index any website via sitemap.xml
- **llms.txt support**: Convert llms.txt/llms-full.txt to context.txt format
- **Language-aware scraping**: Detects and filters multilingual sites
- **Admin dashboard**: Next.js web UI with search, submit, stats, API key management
- **Auth system**: Setup wizard, login, session tokens, API keys
- **MCP server**: Connect ProtoContext to any AI agent via Model Context Protocol
- **WordPress plugin**: Auto-generates context.txt from pages, posts, products
- **Validator**: Python + JavaScript validators for context.txt format

### Architecture
- Engine: FastAPI + Typesense (semantic search via all-MiniLM-L12-v2)
- Dashboard: Next.js 16 + shadcn/ui v4 + Tailwind CSS
- MCP Server: Python MCP SDK
- WordPress Plugin: PHP 7.4+, WooCommerce compatible
- Docker Compose for local development

## [0.1.0] - 2026-02-23

### Added
- Initial release of the ProtoContext specification (SPEC.md)
- `context.txt` format with 4 rules: header, metadata, sections, content rules
- Context sitemap model for multi-page sites
- Reference engine implementation (FastAPI + Typesense)
- Registry system (sites.txt)
- Docker Compose setup
- API endpoints: /search, /site, /batch, /submit, /stats
- WordPress plugin v1.0
- Python and JavaScript validators
- Example files: hotel, saas, docs, restaurant
