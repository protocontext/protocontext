# ProtoContext Specification v1.0

## Overview

ProtoContext defines how websites publish structured content for AI agents and search engines via a `context.txt` file served at the root of any domain.

**Standard file:** `context.txt`
**Location:** `https://domain.com/context.txt`
**Content-Type:** `text/plain; charset=utf-8`

## Format Rules

The format has exactly **4 rules**.

### Rule 1: Header (required)

Every `context.txt` must start with a header:

```
# Site Name
> One line description of what this site/business is
```

- The `#` line is the site name
- The `>` line is a one-line description (max 160 characters)
- Both are required

### Rule 2: Metadata (required)

Metadata fields appear after the header, prefixed with `@`:

```
@lang: en
@version: 1.0
@updated: 2026-02-23
@canonical: https://domain.com/context.txt
@topics: comma, separated, topics
```

**Required fields:**
| Field | Description | Format |
|---|---|---|
| `@lang` | Primary language | ISO 639-1 code |
| `@version` | Spec version | Semantic version |
| `@updated` | Last update date | YYYY-MM-DD |

**Optional fields:**
| Field | Description | Format |
|---|---|---|
| `@canonical` | Canonical URL | Full URL |
| `@topics` | Content topics | Comma-separated |
| `@contact` | Contact info | Email or URL |
| `@license` | Content license | License identifier |

### Rule 3: Sections (one or more required)

Content is organized into sections:

```
## section: Section Title

Real content here. Plain text. Markdown basics only.
No links as main content. The content IS the text.
Each section must be self-contained and answer questions directly.
```

- Section header format: `## section: Title`
- Each section must be self-contained
- Each section should directly answer potential questions
- Recommended: keep each section under ~1000 characters for optimal AI chunking

### Rule 4: Content Rules

- **Plain text + basic markdown only** (no HTML, no JavaScript, no embedded media)
- **Max 500KB** total file size
- **Each section max ~1000 characters** for optimal chunking
- **Real content, not links** — the text IS the value
- **Code examples are allowed** and encouraged (fenced code blocks)
- **No tracking pixels, analytics, or executable content**

## Document Schema

When a parser processes a `context.txt`, each section produces a document:

```json
{
  "id": "domain.com__section-title",
  "domain": "domain.com",
  "section_id": "section-title",
  "title": "Section Title",
  "body": "section content...",
  "url": "https://domain.com/context.txt",
  "updated": "2026-02-23",
  "lang": "en",
  "topics": ["topic1", "topic2"]
}
```

### Field Definitions

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID: `{domain}__{slugified-title}` |
| `domain` | string | Source domain (no protocol) |
| `section_id` | string | Slugified section title |
| `title` | string | Original section title |
| `body` | string | Section content (plain text) |
| `url` | string | Full URL to the context.txt file |
| `updated` | string | Last update date (YYYY-MM-DD) |
| `lang` | string | ISO 639-1 language code |
| `topics` | array | List of topic strings |

## Serving Requirements

- Index file must be served at `/context.txt`
- Content-Type should be `text/plain; charset=utf-8`
- File should be publicly accessible (no authentication)
- CORS headers recommended: `Access-Control-Allow-Origin: *`
- File should respond within 2 seconds

## Context Sitemap (multi-page sites)

For sites with many pages, the standard supports a **sitemap model**:

- `/context.txt` — index/sitemap listing all available context files
- `/context/{slug}.txt` — individual context file per page
- `/context/{type}/{slug}.txt` — grouped by content type

### Index format (`/context.txt`)

The index file contains the site header, metadata, and a **Site Map** section listing all available context files with URLs:

```
# My Website
> One line description

@lang: en
@version: 1.0
@updated: 2026-02-23
@canonical: https://domain.com/context.txt
@topics: topic1, topic2

## section: Site Map

Pages:
  - About — Company history and mission
    https://domain.com/context/about.txt
  - Services — What we offer
    https://domain.com/context/services.txt
  - Services > Web Design — Custom web design services
    https://domain.com/context/services/web-design.txt

Posts:
  - How to Get Started — A beginner's guide
    https://domain.com/context/blog/how-to-get-started.txt

Products:
  - Widget Pro — Our flagship product
    https://domain.com/context/products/widget-pro.txt
```

### Per-page format (`/context/{slug}.txt`)

Each individual context file is a full, self-contained `context.txt`:

```
# Page Title
> Page description

@lang: en
@version: 1.0
@updated: 2026-02-23
@canonical: https://domain.com/context/services.txt
@topics: relevant, page, topics

## section: Services Overview

Content about services...

## section: Pricing

Pricing details...
```

### Path conventions

| Content type | Path pattern |
|---|---|
| Pages | `/context/{slug}.txt` |
| Child pages | `/context/{parent}/{child}.txt` |
| Blog posts | `/context/blog/{slug}.txt` |
| Products | `/context/products/{slug}.txt` |
| Custom types | `/context/{type}/{slug}.txt` |

## Validation

A valid `context.txt` must:

1. Start with a `# Title` line
2. Have a `> Description` line
3. Include at minimum `@lang`, `@version`, and `@updated` metadata
4. Have at least one `## section:` block
5. Not exceed 500KB
6. Contain no HTML or JavaScript

## Versioning

This specification uses semantic versioning. The current version is `1.0`.

Parsers should check `@version` and handle unknown versions gracefully.

---

## Engine API Reference

The ProtoContext engine is a search engine for AI agents. It indexes `context.txt` files and serves them with sub-10ms latency.

**Base URL:** `http://localhost:8000` (default Docker setup)

### Content Indexing

The engine indexes content using a 4-step fallback chain:

| Priority | Source | Method | API key needed |
|---|---|---|---|
| 1 | `/context.txt` | Parse directly | No |
| 2 | `/llms-full.txt` | Convert via AI | Yes |
| 3 | `/llms.txt` | Follow links + convert via AI | Yes |
| 4 | `sitemap.xml` | Scrape pages + convert via AI | Yes |

When both llms.txt and sitemap.xml produce results, the engine picks whichever source generates more sections (richer content). For multilingual sites, the scraper automatically detects the primary language and avoids wasting requests on translations.

Cache TTL: 7 days. After that, content is re-fetched on the next request.

### Supported AI Providers

The engine supports multiple AI providers. Pass `ai_key` and `ai_model` to choose:

| Provider | Model format | Example models |
|---|---|---|
| **Gemini** (default) | `gemini/{model}` | `gemini-3-flash-preview`, `gemini-2.0-flash` |
| **OpenAI** | `openai/{model}` | `gpt-4o-mini`, `gpt-4o` |
| **OpenRouter** | `openrouter/{model}` | `google/gemini-3-flash-preview`, `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3-70b-instruct` |

If `ai_model` is omitted, defaults to `gemini/gemini-3-flash-preview`. The `gemini_api_key` parameter is still accepted for backward compatibility — it maps to `ai_key` with the default Gemini model.

---

### `GET /search`

Full-text search across all indexed sites.

**Parameters:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | string | yes | — | Search query |
| `domain` | string | no | all | Filter results to a specific domain |
| `section` | string | no | all | Filter by section slug |
| `limit` | int | no | 10 | Max results (1-100) |
| `ai_key` | string | no | — | API key for AI provider (Gemini, OpenAI, or OpenRouter) |
| `ai_model` | string | no | `gemini/gemini-3-flash-preview` | Model in `provider/model` format |

**Examples:**

```bash
# Search across all indexed sites
curl "http://localhost:8000/search?q=italian+restaurant"

# Search within a specific domain
curl "http://localhost:8000/search?q=restaurant&domain=www.grandhotelriviera.com"

# Limit results
curl "http://localhost:8000/search?q=spa+wellness&limit=3"

# Filter by section slug
curl "http://localhost:8000/search?q=pricing&section=plans"

# Auto-index with Gemini (default)
curl "http://localhost:8000/search?q=menu&domain=www.cafebistrot.com&ai_key=YOUR_GEMINI_KEY"

# Auto-index with OpenAI
curl "http://localhost:8000/search?q=menu&domain=www.cafebistrot.com&ai_key=YOUR_OPENAI_KEY&ai_model=openai/gpt-4o-mini"

# Auto-index with OpenRouter
curl "http://localhost:8000/search?q=menu&domain=www.cafebistrot.com&ai_key=YOUR_OPENROUTER_KEY&ai_model=openrouter/google/gemini-3-flash-preview"

# Combine domain + limit
curl "http://localhost:8000/search?q=suite&domain=www.grandhotelriviera.com&limit=5"
```

**Response:**

```json
{
  "query": "italian restaurant",
  "results": [
    {
      "domain": "www.grandhotelriviera.com",
      "section": "Trattoria del Mare",
      "body": "Our beachfront restaurant serves fresh seafood daily, with a seasonal menu crafted by Chef Marco Bellini. Open for dinner from 7pm to 11pm, reservations recommended.",
      "url": "https://www.grandhotelriviera.com/context.txt",
      "updated": "2026-02-20",
      "freshness": "cached"
    }
  ],
  "latency_ms": 8
}
```

The `freshness` field indicates whether results came from the cache (`"cached"`) or were fetched live in this request (`"live"`).

---

### `GET /site`

Retrieve all sections for a specific domain.

**Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `domain` | string | yes | Domain to retrieve |
| `ai_key` | string | no | API key for AI provider |
| `ai_model` | string | no | Model in `provider/model` format |

**Examples:**

```bash
# Get all sections for a domain
curl "http://localhost:8000/site?domain=www.grandhotelriviera.com"

# Auto-index with Gemini (default)
curl "http://localhost:8000/site?domain=www.neonhub.io&ai_key=YOUR_GEMINI_KEY"

# Auto-index with OpenAI
curl "http://localhost:8000/site?domain=www.neonhub.io&ai_key=YOUR_OPENAI_KEY&ai_model=openai/gpt-4o-mini"
```

**Response:**

```json
{
  "domain": "www.grandhotelriviera.com",
  "sections": [
    {
      "domain": "www.grandhotelriviera.com",
      "section": "Overview",
      "body": "Grand Hotel Riviera is a 4-star boutique hotel located on the Amalfi Coast. 42 rooms, rooftop pool, private beach access, and two on-site restaurants.",
      "url": "https://www.grandhotelriviera.com/context.txt",
      "updated": "2026-02-20",
      "freshness": "cached"
    }
  ],
  "total_sections": 18,
  "latency_ms": 6
}
```

Returns `404` if the domain has no indexed content.

---

### `POST /submit`

Register a new domain in the index. The engine fetches its content, converts if needed, and indexes it.

**Body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `domain` | string | yes | Domain to submit (no protocol prefix) |
| `ai_key` | string | no | API key for AI provider |
| `ai_model` | string | no | Model in `provider/model` format |

**Examples:**

```bash
# Submit a site with /context.txt — no key needed
curl -X POST http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -d '{"domain": "yourdomain.com"}'

# Submit with Gemini (default)
curl -X POST http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -d '{"domain": "www.grandhotelriviera.com", "ai_key": "YOUR_GEMINI_KEY"}'

# Submit with OpenAI
curl -X POST http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -d '{"domain": "www.grandhotelriviera.com", "ai_key": "YOUR_OPENAI_KEY", "ai_model": "openai/gpt-4o-mini"}'

# Submit with OpenRouter (any model)
curl -X POST http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -d '{"domain": "www.grandhotelriviera.com", "ai_key": "YOUR_OPENROUTER_KEY", "ai_model": "openrouter/anthropic/claude-3.5-sonnet"}'

# Submit with full URL (protocol is stripped automatically)
curl -X POST http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -d '{"domain": "https://www.cafebistrot.com/"}'
```

**Response (registered):**

```json
{
  "status": "registered",
  "domain": "www.grandhotelriviera.com",
  "sections_indexed": 18,
  "source_format": "sitemap_scraped",
  "source_path": "/sitemap.xml"
}
```

**Response (already exists):**

```json
{
  "status": "already_registered",
  "domain": "www.grandhotelriviera.com"
}
```

**Response (no content found):**

```json
{
  "detail": "No valid AI-readable content found for www.emptysite.com. Provide an ai_key (and optionally ai_model) to enable AI-powered content conversion."
}
```

The `source_format` field indicates how the content was obtained:
- `"context"` — native context.txt (parsed directly)
- `"llms_converted"` — converted from llms.txt via AI
- `"sitemap_scraped"` — scraped from sitemap.xml and converted via AI

---

### `POST /batch`

Execute up to 20 search queries in a single API call.

**Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `ai_key` | string | no | API key for AI provider |
| `ai_model` | string | no | Model in `provider/model` format |

**Body (JSON):**

| Field | Type | Description |
|---|---|---|
| `queries` | array | List of query objects (max 20) |
| `queries[].q` | string | Search query |
| `queries[].domain` | string | Optional domain filter |
| `queries[].limit` | int | Optional result limit (default: 5) |

**Examples:**

```bash
# Batch search — multiple queries at once
curl -X POST http://localhost:8000/batch \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {"q": "restaurant", "domain": "www.grandhotelriviera.com", "limit": 3},
      {"q": "coworking space", "limit": 5},
      {"q": "spa wellness treatment"}
    ]
  }'

# Batch with AI key for live indexing
curl -X POST "http://localhost:8000/batch?ai_key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {"q": "menu", "domain": "www.cafebistrot.com"},
      {"q": "pricing", "domain": "www.neonhub.io"}
    ]
  }'

# Batch with OpenAI
curl -X POST "http://localhost:8000/batch?ai_key=YOUR_KEY&ai_model=openai/gpt-4o-mini" \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {"q": "menu", "domain": "www.cafebistrot.com"},
      {"q": "pricing", "domain": "www.neonhub.io"}
    ]
  }'
```

**Response:**

```json
{
  "batch_results": [
    {
      "query": "restaurant",
      "results": [
        {
          "domain": "www.grandhotelriviera.com",
          "section": "Trattoria del Mare",
          "body": "Our beachfront restaurant serves fresh seafood daily..."
        }
      ]
    },
    {
      "query": "coworking space",
      "results": [
        {
          "domain": "www.neonhub.io",
          "section": "Spaces",
          "body": "Flexible desks, private offices, and meeting rooms in downtown Austin. Day passes from $25."
        }
      ]
    }
  ],
  "total_queries": 3,
  "latency_ms": 12
}
```

---

### `GET /stats`

Index statistics.

```bash
curl "http://localhost:8000/stats"
```

**Response:**

```json
{
  "total_documents": 45,
  "is_indexing": false,
  "registered_domains": 6,
  "cached_domains": 4,
  "cache_ttl_days": 7
}
```

---

### `GET /health`

Health check.

```bash
curl "http://localhost:8000/health"
```

**Response (healthy):**

```json
{
  "status": "ok",
  "typesense": "connected"
}
```

**Response (degraded):**

```json
{
  "status": "degraded",
  "typesense": "disconnected"
}
```
