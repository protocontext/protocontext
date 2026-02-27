# Changelog

All notable changes to ProtoContext will be documented in this file.

## [Unreleased] - 2026-02-27

### Added
- **Analytics panel**: new dashboard section with query history feed, top queries bar chart, top domains bar chart, index overview with cache hit rate, and session summary. History stored client-side in `localStorage`.
- **`src/lib/history.ts`**: client-side history module with `logHistory`, `getHistory`, `getTopQueries`, `getTopDomains`, `getAvgLatency`, `clearHistory` helpers.

### Changed
- **Dashboard refactor**: split `page.tsx` (1578 lines) into 14 focused components under `src/components/dashboard/`.
  - `Sidebar.tsx` — left sidebar nav with active state, collapsible AI settings, footer links/logout
  - `panels/SearchPanel.tsx`, `SitePanel.tsx`, `SubmitPanel.tsx`, `DeletePanel.tsx`, `KeysPanel.tsx`, `StatsPanel.tsx`, `ApiReferencePanel.tsx`, `AnalyticsPanel.tsx`
  - `shared/ResultCard.tsx`, `StatCard.tsx`, `CodeBlock.tsx`, `ApiEndpoint.tsx`
- Layout changed from horizontal tabs to sidebar + main content area with mobile hamburger menu.
- AI provider settings moved from top toolbar into collapsible sidebar section.
- `StatsPanel` expanded with two-column detail view (index detail + health cards).
- Search and Site queries now log to local history for analytics.

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
