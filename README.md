<div align="center">

# ProtoContext

**Deterministic knowledge layer for RAG systems.**

Open standard + search engine + optional semantic retrieval for AI-readable web content.

ProtoContext lets AI agents read structured knowledge from `context.txt` instead of depending only on raw HTML scraping and fully probabilistic retrieval pipelines. You can publish `context.txt` on your domain, or upload structured context directly from the dashboard (no URL required).  

Use ProtoContext as a fast deterministic path, and add semantic/vector retrieval only when needed.

Website: https://protocontext.org/

[![Spec v1.0](https://img.shields.io/badge/spec-v1.0-10b981?style=flat-square)](SPEC.md)
[![Engine v0.1.1-beta](https://img.shields.io/badge/engine-v0.1.1--beta-10b981?style=flat-square)](engine/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-10b981?style=flat-square)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-10b981?style=flat-square)](mcp-server/)

[Specification](SPEC.md) &bull; [Quick Start](#quick-start) &bull; [Search Engine](#search-engine) &bull; [MCP Server](#mcp-server)

</div>

---

## Why ProtoContext

ProtoContext is best when knowledge is structured and deterministic:
- products, prices, hours, policies, docs
- low-latency agent responses
- predictable answers from publisher-authored content
- reduced operational overhead (scraping/chunking/embedding pipeline becomes optional)

Traditional RAG is still best for:
- massive, unstructured corpora
- deep semantic discovery across noisy text
- use cases where exact schema is unavailable

ProtoContext does not replace RAG. It makes full RAG pipelines optional for many production flows.

---

## Fast Path vs Traditional RAG

| | Traditional RAG Pipeline | ProtoContext Fast Path |
|---|---|---|
| **Primary input** | Unstructured pages/docs | Structured `context.txt` |
| **Typical latency** | ~200-500ms | <30ms |
| **Retrieval behavior** | Probabilistic | Deterministic-first |
| **Infra complexity** | Higher (chunking + embeddings + vector DB + rerank) | Lower (structured index/search) |
| **When needed** | Semantic-heavy discovery | Exact, structured agent answers |

---

## Quick Start

You have two options:

1. Publish `context.txt` at `yourdomain.com/context.txt`
2. Upload structured `context.txt` from the dashboard (URL hosting optional)

Example:

```txt
# Your Site Name
> One-line description of what this site does

@lang: en
@version: 1.0
@updated: 2026-02-25
@topics: your, relevant, topics
@content_type: website

## section: About
What your site does, in plain text.

## section: Key Information
Prices, hours, contacts, features.
```

Read the full spec: [SPEC.md](SPEC.md)

---

## Search Engine

ProtoContext includes a search engine for AI agents:
- indexes `context.txt` (or falls back to scraping when missing)
- serves structured results in the deterministic fast path
- supports semantic retrieval when configured

### Content Ingestion Priority

| Priority | Source | Method | AI Key Needed |
|---|---|---|---|
| 1 | `/context.txt` | Direct parse | No |
| 2 | `/llms-full.txt` or `/llms.txt` | AI conversion | Yes |
| 3 | `sitemap.xml` | Scrape + convert | Yes |
| 4 | Internal links | BFS crawl fallback | Yes |

Scraping is optional fallback when structured context is not available.

---

## API

All protected endpoints require `X-Proto-Token`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/search?q=...` | Search across indexed sites |
| `GET` | `/site?domain=...` | Get sections for one domain |
| `POST` | `/submit` | Submit domain for indexing |
| `POST` | `/delete` | Remove domain |
| `POST` | `/batch` | Multi-query search |
| `GET` | `/stats` | Index stats |
| `GET` | `/health` | Health check |

Common filters: `domain`, `lang`, `content_type`, `section`, `limit`.

---

## Architecture

```txt
protocontext/
├── engine/             # API + indexer + crawler/scraper + auth
├── web/                # Dashboard (search, submit, setup, settings)
├── mcp-server/         # MCP tools for AI agents
├── validator/          # context.txt validation
├── wordpress-plugin/   # WordPress + WooCommerce integration
├── examples/           # Example context files
└── SPEC.md             # Spec v1.0
```

Spec is stable (`v1.0`). Engine is in beta (`v0.1.1-beta`).

---

## License

Apache 2.0. See [LICENSE](LICENSE).
