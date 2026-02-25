<div align="center">

# ProtoContext

**The open standard + search engine + RAG for AI-readable web content.**

ProtoContext is an open standard that allows AI agents to consume structured knowledge directly through a standardized plain-text format (context.txt), instead of scraping websites, parsing HTML, chunking content, and relying exclusively on embedding-based vector databases. A context.txt file can be published by a website, or loaded locally by an application and used as a lightweight RAG-style knowledge source. Because the structure is explicit and deterministic, agents can retrieve the exact relevant information with very low latency and high predictability. No scraping pipelines are required, embeddings are optional rather than mandatory, and the same format works both as a standalone agent knowledge layer and as an input for search engines or vector-based systems. Think of it as an agent-native, deterministic knowledge layer, with optional indexing and search on top, rather than a purely probabilistic semantic RAG pipeline.

Website: https://protocontext.org/

[![Spec v1.0](https://img.shields.io/badge/spec-v1.0-10b981?style=flat-square)](SPEC.md)
[![Engine v0.1.1-beta](https://img.shields.io/badge/engine-v0.1.1--beta-10b981?style=flat-square)](engine/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-10b981?style=flat-square)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-10b981?style=flat-square)](mcp-server/)

[Specification](SPEC.md) &bull; [Quick Start](#quick-start) &bull; [Search Engine](#search-engine) &bull; [MCP Server](#mcp-server) &bull; [WordPress Plugin](#wordpress-plugin)

</div>

---

## The Problem

Today, most AI agents understand websites by scraping and parsing raw HTML. That means processing navigation bars, cookie banners, layout markup, and JavaScript before reaching the actual content. This adds token overhead, increases latency, and reduces accuracy due to UI noise and structural ambiguity.

## The Solution

A single plain text file at `/context.txt` that gives AI agents everything they need in milliseconds.

| | Traditional Scraping | context.txt |
|---|---|---|
| **How AI reads your site** | Scrapes and parses HTML | Reads structured text |
| **Tokens consumed** | 50,000+ | ~2,000 |
| **Response time** | 5-10 seconds | <10ms |
| **Accuracy** | Low (noise from UI) | High (pure signal) |

---

## Quick Start

Create `yourdomain.com/context.txt`:

```
# Your Site Name
> One-line description of what this site does

@lang: en
@version: 1.0
@updated: 2026-02-24
@topics: your, relevant, topics

## section: About
What your site does, in plain text.
Write for AI agents, not for Google.

## section: Key Information
Prices, hours, contacts, features — whatever matters most.
```

No software to install. No API keys. Just a text file.

The format has exactly **4 rules**: header, metadata, sections, and content rules. Read the full spec: **[SPEC.md](SPEC.md)**

---

## Architecture

```
protocontext/
├── engine/               # FastAPI search engine + Docker
│   ├── api.py            # REST API (search, submit, delete, auth)
│   ├── indexer.py         # Typesense indexing + vector search
│   ├── crawler.py         # Multi-source content fetcher
│   ├── scraper.py         # Web scraper (trafilatura + httpx)
│   ├── converter.py       # AI content conversion (Gemini, OpenAI, OpenRouter)
│   ├── parser.py          # context.txt parser
│   ├── auth.py            # Auth system (sessions, API keys, admin)
│   └── docker-compose.yml
├── web/                  # Next.js 16 admin dashboard
│   └── src/app/
│       ├── dashboard/     # Search, submit, settings, API keys
│       ├── setup/         # First-run setup wizard
│       └── login/         # Authentication
├── mcp-server/           # MCP server for AI agents
│   └── server.py          # 5 tools: search, site, submit, delete, stats
├── validator/            # context.txt validators
│   ├── validator.py       # Python validator
│   └── validator.js       # JavaScript validator
├── wordpress-plugin/     # WordPress auto-generation
│   └── protocontext/      # PHP plugin with WooCommerce support
├── examples/             # Example context.txt files
├── registry/             # Indexed domains registry (sites.txt)
└── SPEC.md               # Full specification
```

### Tech Stack

| Component | Technology |
|---|---|
| **Search Engine** | [Typesense](https://typesense.org) v27.1 (full-text + vector search via all-MiniLM-L12-v2) |
| **API** | Python, FastAPI |
| **Dashboard** | Next.js 16, shadcn/ui v4, Tailwind CSS 4 |
| **MCP Server** | Python, MCP SDK |
| **WordPress** | PHP 7.4+, WooCommerce compatible |
| **Infrastructure** | Docker Compose |

---

## Search Engine

ProtoContext includes a **search engine for the agent era** — indexes `context.txt` files across the web and serves structured results with sub-10ms latency.

### Deploy (one server, ~$6/mo)

Install on any VPS (DigitalOcean, Hetzner, AWS, etc.) with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/protocontext/protocontext/main/install.sh | bash
```

With a custom domain (auto HTTPS via Let's Encrypt):

```bash
curl -fsSL https://raw.githubusercontent.com/protocontext/protocontext/main/install.sh | DOMAIN=ai.yourdomain.com bash
```

This runs **API + Dashboard + Typesense + Caddy** on a single $6/mo droplet via Docker Compose.

<div align="center">

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/droplets/new?image=docker-20-04&size=s-1vcpu-1gb&region=nyc1)
&nbsp;&nbsp;
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/protocontext)

</div>

### Run Locally

```bash
cd engine
docker compose up
```

The engine runs at `http://localhost:8000` with the admin dashboard at `http://localhost:3000`.

### Content Indexing

The engine can index **any website**, even without a `context.txt` file, using a multi-step fallback:

| Priority | Source | Method | AI Key Needed |
|---|---|---|---|
| 1 | `/context.txt` | Direct parse | No |
| 2 | `/llms-full.txt` / `/llms.txt` | Convert via AI | Yes |
| 3 | `sitemap.xml` | Scrape pages with trafilatura | Yes |
| 4 | Internal links | BFS crawl (2 levels deep) | Yes |

### API Endpoints

All endpoints require authentication via `X-Proto-Token` header (session token or API key).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/search?q=...` | Full-text search across all indexed sites |
| `GET` | `/site?domain=...` | Get all sections for a specific domain |
| `POST` | `/submit` | Submit a domain to the index |
| `POST` | `/submit-stream` | Submit with real-time SSE progress |
| `POST` | `/delete` | Remove a domain from the index |
| `POST` | `/batch` | Multiple search queries in one request |
| `GET` | `/stats` | Index statistics |
| `GET` | `/health` | Health check |

#### Search Filters

The search endpoint supports powerful filtering:

| Param | Description | Example |
|---|---|---|
| `q` | Search query | `?q=italian+restaurant` |
| `domain` | Filter by domain | `&domain=example.com` |
| `lang` | Filter by language | `&lang=es` |
| `content_type` | Filter by PCE type | `&content_type=product` |
| `section` | Filter by section slug | `&section=pricing` |
| `limit` | Max results (1-100) | `&limit=5` |

AI credentials are passed via headers: `X-AI-Key` and `X-AI-Model`.

#### Examples

```bash
# Search across all indexed sites
curl "http://localhost:8000/search?q=payments&limit=5" \
  -H "X-Proto-Token: YOUR_TOKEN"

# Search within a specific domain
curl "http://localhost:8000/search?q=spa&domain=hotelriviera.com" \
  -H "X-Proto-Token: YOUR_TOKEN"

# Filter by language
curl "http://localhost:8000/search?q=menu&lang=es" \
  -H "X-Proto-Token: YOUR_TOKEN"

# Get all sections for a domain
curl "http://localhost:8000/site?domain=stripe.com" \
  -H "X-Proto-Token: YOUR_TOKEN"

# Submit a new domain (no AI key needed if site has /context.txt)
curl -X POST http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -H "X-Proto-Token: YOUR_TOKEN" \
  -d '{"domain": "example.com"}'

# Submit with AI conversion
curl -X POST http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -H "X-Proto-Token: YOUR_TOKEN" \
  -d '{"domain": "example.com", "ai_key": "YOUR_KEY", "ai_model": "gemini/gemini-3-flash-preview"}'
```

### AI Providers

For sites without `/context.txt`, the engine converts content using AI:

| Provider | Model Format | Example |
|---|---|---|
| **Gemini** (default) | `gemini/{model}` | `gemini/gemini-3-flash-preview` |
| **OpenAI** | `openai/{model}` | `openai/gpt-4o-mini` |
| **OpenRouter** | `openrouter/{model}` | `openrouter/anthropic/claude-3.5-sonnet` |

AI keys are passed per-request and **never stored** on the server.

---

## PCE — ProtoContext Extensions

PCE adds structured data blocks to `context.txt` for specific industries. Each block uses `KEY: value` pairs that AI agents can parse directly.

### Ecommerce (WooCommerce)

```
## section: Wireless Headphones Pro

Premium noise-cancelling headphones with 40-hour battery life.

PRODUCT_ID: WH-PRO-500
PRICE: 299.99
CURRENCY: USD
STOCK_STATUS: in_stock
PURCHASE_URL: https://store.example.com/headphones-pro
ACTION: product_purchase
```

### Hospitality

```
## section: Deluxe Ocean Suite

Spacious 45m2 suite with panoramic ocean views, king bed, and private balcony.

ROOM_TYPE: suite
CAPACITY: 2 adults, 1 child
PRICE_FROM: 350
CURRENCY: EUR
BOOKING_URL: https://hotel.example.com/book/ocean-suite
ACTION: room_booking
```

### Tours & Activities

```
## section: Sunset Sailing Tour

3-hour catamaran cruise along the coast with drinks and snacks included.

TOUR_ID: SAIL-001
DURATION: 3 hours
PRICE_FROM: 89
CURRENCY: USD
AVAILABILITY: daily, 5:30 PM
BOOKING_URL: https://tours.example.com/sunset-sail
ACTION: tour_booking
```

Supported content types: `website`, `ecommerce`, `hospitality`, `tours`, `restaurant`, `realestate`, `healthcare`, `education`

---

## MCP Server

Connect ProtoContext to Claude, Cursor, Windsurf, or any MCP-compatible AI agent.

### Tools

| Tool | Description |
|---|---|
| `protocontext_search` | Search AI-readable content across all indexed sites |
| `protocontext_site` | Get all context sections for a specific domain |
| `protocontext_submit` | Register a new domain to the index |
| `protocontext_delete` | Remove a domain from the index |
| `protocontext_stats` | Index statistics and health |

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "protocontext": {
      "command": "uv",
      "args": ["--directory", "/path/to/protocontext/mcp-server", "run", "server.py"]
    }
  }
}
```

### Claude Code Configuration

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "protocontext": {
      "command": "uv",
      "args": ["--directory", "/path/to/protocontext/mcp-server", "run", "server.py"]
    }
  }
}
```

### Run Standalone

```bash
# stdio (for Claude Desktop / Claude Code)
cd mcp-server && uv run server.py

# SSE (for remote access)
cd mcp-server && uv run server.py --sse
```

---

## Admin Dashboard

A web-based admin panel built with Next.js 16 and shadcn/ui for managing your ProtoContext instance.

**Features:**
- **Search** — Full-text search with domain, language, and content type filters
- **Submit** — Add domains with real-time SSE progress (checking, scraping, converting, indexing)
- **Settings** — Configure AI provider, model, and API key
- **API Keys** — Generate and manage API keys for programmatic access
- **Auth** — First-run setup wizard, session-based login

### First Run

1. Start the engine: `cd engine && docker compose up`
2. Start the dashboard: `cd web && npm run dev`
3. Open `http://localhost:3000` — you'll be redirected to the setup wizard
4. Create your admin account and save your token

---

## WordPress Plugin

Auto-generate `context.txt` for your WordPress site. Full WooCommerce support with PCE structured data.

### Features

- Auto-generates `/context.txt` sitemap index
- Individual context files for pages, posts, products, and categories
- **WooCommerce integration**: PCE product blocks with pricing, stock, variations
- **Variable product support**: Lists all variations with attributes
- Industry auto-detection (ecommerce, hospitality, etc.)
- Admin settings page with live preview

### Routes

| Route | Content |
|---|---|
| `/context.txt` | Site index with sitemap |
| `/context/{page-slug}.txt` | Individual page |
| `/context/blog/{post-slug}.txt` | Blog post |
| `/context/products/{product-slug}.txt` | Product (with PCE) |
| `/context/shop/{category-slug}.txt` | Product category |

### Installation

1. Copy `wordpress-plugin/protocontext/` to `wp-content/plugins/`
2. Activate in WordPress admin
3. Visit Settings > ProtoContext to configure
4. Your `context.txt` is live at `yourdomain.com/context.txt`

---

## Context Sitemap

For multi-page sites, use one `context.txt` per page:

```
/context.txt                        -> site index
/context/about.txt                  -> about page
/context/products/widget-pro.txt    -> product page
/context/blog/getting-started.txt   -> blog post
/context/shop/electronics.txt       -> category page
```

The index file (`/context.txt`) contains a **Site Map** section listing all available context files with URLs. Each linked file is a self-contained `context.txt` with its own header, metadata, and sections.

---

## Validators

Validate your `context.txt` files before publishing:

```bash
# Python
python validator/validator.py your-context.txt

# JavaScript
node validator/validator.js your-context.txt
```

Both validators check: header format, required metadata, section structure, content rules, and file size.

---

## Examples

| Example | Description | File |
|---|---|---|
| Hotel | Boutique hotel with rooms, restaurant, spa | [hotel.context.txt](examples/hotel.context.txt) |
| SaaS | Payment platform with pricing and features | [saas.context.txt](examples/saas.context.txt) |
| Documentation | Developer docs with API reference | [docs.context.txt](examples/docs.context.txt) |
| Restaurant | Local restaurant with menu and hours | [restaurant.context.txt](examples/restaurant.context.txt) |

---

## Development

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for dashboard)
- Python 3.10+ (for MCP server)
- uv (for MCP server)

### Local Setup

```bash
# 1. Start the engine (API + Typesense)
cd engine
docker compose up -d

# 2. Start the dashboard
cd web
npm install
npm run dev

# 3. Open http://localhost:3000 and complete setup
```

### Expose via Cloudflare Tunnel (optional)

Share your local instance with the internet (useful for n8n, external MCP clients, testing):

```bash
# From the project root
./tunnel.sh
# → https://random-words.trycloudflare.com
```

The script handles a common pitfall: if you have an existing `~/.cloudflared/config.yml` (named tunnels, ingress rules), it would override the quick tunnel and cause 404s. The script uses `--config /dev/null` to bypass this cleanly.

You can also tunnel a specific port:

```bash
./tunnel.sh 3000   # tunnel the dashboard instead
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TYPESENSE_URL` | `http://typesense:8108` | Typesense connection URL |
| `TYPESENSE_API_KEY` | `protocontext-dev-key` | Typesense API key |
| `PROTO_API_TOKEN` | _(empty)_ | Legacy mode: static API token |

---

## License

Everything in this repository is licensed under the [Apache License 2.0](LICENSE).

This means you can freely use, modify, distribute, and commercialize ProtoContext — including the specification, engine, dashboard, MCP server, validators, and WordPress plugin. The only requirements are attribution and stating any changes made. Apache 2.0 also includes patent protection for contributors and users.
