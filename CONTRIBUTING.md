# Contributing to ProtoContext

Thanks for your interest in contributing to ProtoContext. This document outlines how to get involved, the areas where help is most needed, and the vision for where this project is heading.

ProtoContext is an open standard + search engine for AI-readable web content. We're building the infrastructure that connects AI agents to the real web — structured, fast, and decentralized.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Priority Areas](#priority-areas)
  - [AI Scraping & Conversion](#1-ai-scraping--conversion)
  - [Latency & Performance](#2-latency--performance)
  - [Federated Network](#3-federated-network-protocontext-mesh)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Reporting Issues](#reporting-issues)
- [License](#license)

---

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see below)
4. Pick an issue or area from [Priority Areas](#priority-areas)
5. Create a branch, make your changes, open a PR

## Development Setup

### Prerequisites

- Docker & Docker Compose
- Python 3.10+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) (for MCP server)

### Run Everything Locally

```bash
# 1. Start the engine (API + Typesense)
cd engine
docker compose up -d

# 2. Start the dashboard
cd web
npm install
npm run dev

# 3. Open http://localhost:3000 and complete the setup wizard

# 4. (Optional) Run the MCP server
cd mcp-server
uv run server.py
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TYPESENSE_URL` | `http://typesense:8108` | Typesense connection URL |
| `TYPESENSE_API_KEY` | `protocontext-dev-key` | Typesense API key |
| `PROTO_API_TOKEN` | _(empty)_ | Legacy mode: static API token |

---

## Priority Areas

These are the three major areas where contributions will have the highest impact. Each represents a significant evolution of the system.

---

### 1. AI Scraping & Conversion

**Goal:** Make the AI content conversion smarter, more reliable, and less wasteful.

**Current state:** When a site doesn't have `/context.txt`, the engine scrapes it and sends the content to an AI provider (Gemini, OpenAI, or OpenRouter) for conversion. This works, but has significant room for improvement.

**Key files:**
- `engine/scraper.py` — Web scraping with trafilatura + httpx
- `engine/converter.py` — AI-powered content conversion
- `engine/crawler.py` — Multi-source fetcher (context.txt > llms.txt > sitemap > crawl)
- `engine/parser.py` — context.txt parser

#### Ideas & Challenges

**Smarter scraping:**
- The current scraper uses trafilatura for content extraction. Some sites return garbage (cookie banners, nav menus, JavaScript-heavy content). We need better heuristics to detect and filter low-quality content _before_ sending it to AI.
- Implement page-type detection (product page vs. blog post vs. landing page vs. documentation) so the AI prompt can be specialized per page type. Right now we use one generic prompt for everything.
- Add support for JavaScript-rendered content (headless browser fallback for SPAs). Currently we only scrape static HTML.

**Conversion quality:**
- The AI conversion prompt in `converter.py` produces decent context.txt output, but it often misses PCE structured blocks (PRODUCT_ID, PRICE, BOOKING_URL, etc.). We need specialized prompts per content type that explicitly instruct the AI to extract structured data.
- Add a post-conversion validator that checks the AI output against the spec. If the output is malformed, retry with a corrected prompt instead of indexing garbage.
- Support multi-pass conversion: first pass extracts raw content, second pass structures it into proper context.txt sections with PCE blocks.

**Token efficiency:**
- Large sites generate massive scraped content that exceeds AI context windows. Implement smarter chunking — split by page, summarize each chunk, then merge.
- Track token usage per conversion and expose it in the API response (`tokens_used` field) so users can monitor costs.
- Implement a "content fingerprint" system — hash the scraped content and skip re-conversion if the site hasn't changed since last crawl.

**New sources:**
- Add support for RSS/Atom feeds as a content source (between llms.txt and sitemap in the fallback chain).
- Support structured data extraction from JSON-LD, Open Graph, and Schema.org markup already embedded in pages.
- Support PDF extraction for documentation-heavy sites.

#### Good First Issues

- Add JSON-LD extraction as a supplementary data source in `scraper.py`
- Add a `--dry-run` flag to the submit endpoint that returns what _would_ be indexed without actually indexing
- Improve language detection in `converter.py` to handle multilingual pages better

---

### 2. Latency & Performance

**Goal:** Sub-5ms search latency at scale. Zero-cost operations for cached content.

**Current state:** Search latency is already good (~8ms for cached queries) thanks to Typesense and an in-memory LRU cache. But there's a lot of room to optimize, especially for cold starts and high-concurrency scenarios.

**Key files:**
- `engine/api.py` — API endpoints, caching, connection pooling
- `engine/indexer.py` — Typesense indexing and search
- `engine/crawler.py` — Background crawling

#### Ideas & Challenges

**Search optimization:**
- The current LRU cache (`_search_cache` in `api.py`) is in-memory with a 15-minute TTL and 500-entry limit. For production deployments, we should support Redis as an optional cache backend while keeping the in-memory cache as default.
- Implement query result pre-warming — when a domain is submitted, pre-cache the most likely search queries (domain name, common keywords from sections).
- Add search result compression — for large result sets, compress the response body with gzip/brotli.

**Indexing optimization:**
- Batch indexing currently processes documents sequentially. Implement parallel upsert with Typesense's import API for bulk operations.
- The initial crawl on startup re-indexes everything. Implement incremental indexing — only re-index documents whose content hash has changed.
- Add a background refresh queue that re-crawls stale domains (> 7 days) during low-traffic periods instead of on-demand.

**Connection management:**
- The global httpx connection pool (`_httpx_pool`) is shared across all requests. Under high concurrency, this can become a bottleneck. Profile and tune the pool limits.
- Add connection pooling for Typesense client (currently creates a new client per call in some paths).

**Monitoring & profiling:**
- Add Prometheus metrics endpoint (`/metrics`) for monitoring search latency, cache hit rates, indexing throughput, and error rates.
- Add request tracing with unique request IDs propagated through the entire pipeline (API > crawler > scraper > converter > indexer).
- Implement a `/debug/performance` endpoint that returns p50/p95/p99 latency stats.

#### Good First Issues

- Add gzip compression to API responses
- Add a `X-Cache: HIT/MISS` response header to indicate cache status
- Add timing breakdown to search responses (`parse_ms`, `search_ms`, `format_ms`)

---

### 3. Federated Network (ProtoContext Mesh)

**Goal:** Every ProtoContext installation can optionally share its indexed sites with other installations, creating a decentralized search network.

**Current state:** Each installation is completely isolated — it only knows about domains that have been submitted to it directly. There's no way to discover or query content indexed by other installations.

**This is the biggest architectural challenge and the most impactful feature on the roadmap.**

#### The Vision

Imagine a network where:

```
Installation A (hotel-focused)       Installation B (SaaS-focused)
├── hotel-riviera.com                ├── stripe.com
├── booking-platform.io              ├── vercel.com
└── travel-guide.net                 └── supabase.com
         │                                    │
         └──────── ProtoContext Mesh ──────────┘
                          │
              Installation C (general)
              ├── can search ALL sites
              └── contributes its own sites
```

Each installation is autonomous. It indexes its own sites. But if the operator opts in, it can:

1. **Announce** its indexed domains to the network
2. **Discover** domains indexed by other installations
3. **Query** remote installations for content it doesn't have locally
4. **Replicate** popular content locally for faster access

#### Architecture Proposal

```
┌─────────────────────────────────────────────────────┐
│                    ProtoContext Node                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Engine   │  │  Mesh    │  │  Registry          │ │
│  │  (local)  │◄─┤  Agent   │──┤  (local + remote)  │ │
│  └──────────┘  └────┬─────┘  └───────────────────┘  │
│                     │                                 │
└─────────────────────┼─────────────────────────────────┘
                      │ gossip protocol
                      ▼
          ┌───────────────────────┐
          │   Other Mesh Nodes    │
          └───────────────────────┘
```

**Mesh Agent** — A new component that runs alongside the engine:
- Maintains a list of known peers (other ProtoContext installations)
- Periodically announces local domains to peers (gossip protocol)
- Receives domain announcements from peers
- Routes search queries to relevant peers when local results are insufficient
- Optionally replicates high-demand content locally

#### Key Design Decisions Needed

**Discovery:**
- How do nodes find each other? Options:
  - **Bootstrap nodes** — hardcoded list of well-known nodes (like BitTorrent trackers)
  - **DNS-based** — `_protocontext._tcp.domain.com` SRV records
  - **Manual peering** — operators explicitly add peers via the dashboard
  - **Hybrid** — manual peering + optional bootstrap for auto-discovery

**Trust & privacy:**
- Nodes should be able to choose what they share (all domains, specific domains, nothing)
- Domain owners should be able to opt out of federation (`@federate: false` in context.txt metadata)
- Search queries should not leak to untrusted peers (query routing should be domain-based, not content-based)

**Consistency:**
- How to handle conflicting versions of the same domain across nodes?
- Freshness: should remote content have a different TTL than local content?
- What happens when a domain is deleted from one node but replicated on others?

**Protocol:**
- REST-based peer communication (simplest, works with existing infrastructure)
- gRPC for performance-critical paths (search queries between peers)
- WebSocket for real-time announcements

#### Implementation Phases

**Phase 1 — Peer registry & announcements:**
- Add `POST /mesh/peers` to register a peer
- Add `GET /mesh/peers` to list known peers
- Add `GET /mesh/domains` to list domains available for federation
- Periodic heartbeat to check peer health
- Dashboard UI for managing peers

**Phase 2 — Federated search:**
- When a search returns insufficient local results, query known peers
- Merge and deduplicate results from multiple sources
- Add `source_node` field to search results
- Implement timeout and fallback (if peer is slow, return local results only)

**Phase 3 — Content replication:**
- Track search frequency per domain
- Automatically replicate high-demand remote content locally
- Implement cache invalidation across the network
- Add bandwidth controls (max replication rate, storage limits)

**Phase 4 — Decentralized discovery:**
- Implement gossip protocol for peer discovery
- Bootstrap node registry
- NAT traversal for installations behind firewalls

#### Key Files to Create

- `engine/mesh.py` — Mesh agent (peer management, announcements, federation)
- `engine/mesh_protocol.py` — Wire protocol for inter-node communication
- API endpoints in `api.py` — `/mesh/*` routes
- Dashboard pages — peer management UI

#### Good First Issues

- Design the mesh protocol spec (as a markdown document in `docs/`)
- Add `@federate` metadata field support to the parser
- Create the `/mesh/peers` and `/mesh/domains` endpoints (read-only first)
- Add a "Network" tab to the dashboard showing peer status

---

## Project Structure

| Directory | Language | What It Does |
|---|---|---|
| `engine/` | Python | FastAPI search engine, Typesense indexing, crawling, AI conversion |
| `web/` | TypeScript | Next.js 16 admin dashboard with shadcn/ui |
| `mcp-server/` | Python | MCP server for AI agents (Claude, Cursor, etc.) |
| `validator/` | Python + JS | context.txt validators |
| `wordpress-plugin/` | PHP | WordPress plugin with WooCommerce PCE support |
| `examples/` | Text | Example context.txt files |
| `registry/` | Text | Indexed domains list (sites.txt) |

---

## How to Contribute

### Types of Contributions

| Type | Description |
|---|---|
| **Bug fixes** | Fix issues in any component |
| **Features** | Implement new functionality (check Priority Areas) |
| **Performance** | Optimize latency, memory, or throughput |
| **Documentation** | Improve docs, add examples, write guides |
| **Testing** | Add unit tests, integration tests, benchmarks |
| **Spec improvements** | Propose changes to SPEC.md |
| **WordPress** | Improve plugin, add CMS integrations |
| **MCP tools** | Add new tools or improve existing ones |
| **context.txt files** | Create examples for different industries |

### What We're NOT Looking For

- Changes that break the spec (backwards compatibility matters)
- Adding external dependencies without clear justification
- AI provider lock-in (all AI integrations must support multiple providers)
- Features that require paid services to function (core features must work without API keys)

---

## Code Style

### Python (engine, MCP server)

- Follow PEP 8
- Type hints for all function signatures
- Docstrings for public functions
- Use `async/await` for I/O operations
- Keep functions focused — one function, one job

### TypeScript (dashboard)

- Follow the existing Next.js 16 + shadcn/ui patterns
- Use TypeScript strict mode
- Prefer `const` over `let`
- Use shadcn/ui components instead of custom HTML

### PHP (WordPress plugin)

- Follow WordPress coding standards
- Use proper escaping (`esc_html`, `wp_kses`, etc.)
- Prefix all functions with `protocontext_`
- Support PHP 7.4+

---

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add JSON-LD extraction to scraper
fix: handle empty sitemap URLs in crawler
perf: add gzip compression to search responses
docs: add federation protocol spec
refactor: extract cache logic from api.py
test: add scraper unit tests for edge cases
```

Format: `type: short description`

Types: `feat`, `fix`, `perf`, `docs`, `refactor`, `test`, `chore`

---

## Pull Requests

1. **One PR, one concern.** Don't mix features with refactoring.
2. **Describe what and why.** Not just what changed, but why it matters.
3. **Include a test plan.** How can we verify this works?
4. **Update docs** if your change affects the API, spec, or configuration.
5. **Keep it small** when possible. Large PRs are hard to review.

### PR Template

```markdown
## What

Brief description of the change.

## Why

What problem does this solve?

## How

Key implementation details.

## Test Plan

- [ ] How to verify this works
- [ ] Edge cases considered
```

---

## Reporting Issues

When reporting bugs, please include:

1. **What happened** vs. **what you expected**
2. **Steps to reproduce**
3. **Environment** (OS, Docker version, browser if dashboard-related)
4. **Logs** (from `docker compose logs api` or browser console)
5. **Screenshots** if relevant (especially for dashboard issues)

For feature requests, describe:
1. **The problem** you're trying to solve
2. **Your proposed solution** (if you have one)
3. **Alternatives** you considered

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE), the same license that covers the entire project.

---

## Questions?

Open an issue or start a discussion. We're building this together.
