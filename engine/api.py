"""
ProtoContext API — FastAPI search endpoint for the ProtoContext engine.

Endpoints:
    GET  /search         — search indexed sites (with optional domain/section filter)
    GET  /site           — get all sections for a domain
    POST /batch          — batch multiple queries
    POST /submit         — submit a domain to the registry
    POST /submit-stream  — submit with SSE progress events
    POST /delete         — remove a domain from the index
    GET  /stats          — index statistics
    GET  /health         — health check
    POST /api-keys       — generate a new API key (admin-only)
    GET  /api-keys       — list all API keys (admin-only)
    DELETE /api-keys/{id}— revoke an API key (admin-only)
    GET  /auth/status    — check if setup is needed
    POST /auth/setup     — first-run admin account creation
    POST /auth/login     — login with email + password
    POST /auth/logout    — invalidate current session

Supports multiple AI providers for content conversion:
    - Gemini (Google) — default
    - OpenAI (GPT models)
    - OpenRouter (hundreds of models)

AI key and model are passed per-request, never stored.
"""

import os
import json
import time
import hashlib
import asyncio
import logging
from collections import OrderedDict
from datetime import datetime, date, timedelta, timezone
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from typing import Optional, AsyncGenerator

from fastapi import FastAPI, Query, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import httpx

from typesense.exceptions import TypesenseClientError

from parser import parse, is_context_format, is_llms_format
from crawler import fetch_context, load_registry, crawl_all, _try_fetch_path, _extract_root_domain, FETCH_PATHS, USER_AGENT, FETCH_TIMEOUT
from converter import fetch_and_convert, convert_scraped_to_context, _detect_language
from scraper import scrape_site_content, fetch_sitemap_urls, scrape_page_content, _filter_best_language_urls, _is_content_url, _path_to_title, _crawl_internal_links, MAX_PAGES
from indexer import get_client, setup_index, index_documents, delete_domain, search as engine_search, get_stats
import auth

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("protocontext.api")

# --- API Token protection ---
# Set PROTO_API_TOKEN env var to require X-Proto-Token header on all requests.
# If not set, the API is open (development mode).
PROTO_API_TOKEN = os.environ.get("PROTO_API_TOKEN", "")

# Public endpoints that don't require a token
PUBLIC_PATHS = {"/health", "/docs", "/openapi.json", "/redoc", "/auth/status", "/auth/setup", "/auth/login"}

ALLOWED_ORIGINS = [
    "https://protocontext.org",
    "https://www.protocontext.org",
    "https://app.protocontext.org",
    "http://localhost:3000",
    "http://localhost:8000",
]

_DEFAULT_REGISTRY = os.path.join(os.path.dirname(__file__), "..", "registry", "sites.txt")
_DOCKER_REGISTRY = "/app/registry/sites.txt"
REGISTRY_PATH = _DOCKER_REGISTRY if os.path.exists(_DOCKER_REGISTRY) else _DEFAULT_REGISTRY
CACHE_TTL_DAYS = 7


# --- Performance: In-memory caches ---

# Track when domains were last fetched (avoids re-fetching)
domain_fetch_times: dict[str, datetime] = {}

# In-memory registry (loaded once at startup, mutated on submit/delete)
_registry_domains: set[str] = set()

# LRU search result cache with TTL (max 500 entries, 15 min TTL)
SEARCH_CACHE_MAX = 500
SEARCH_CACHE_TTL = 900  # 15 minutes
_search_cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()

# Global httpx client pool (created on startup, reused for all external requests)
_httpx_pool: httpx.AsyncClient | None = None


def _get_registry() -> set[str]:
    """Return in-memory registry (O(1) lookup instead of reading file)."""
    return _registry_domains


def _registry_add(domain: str):
    """Add domain to in-memory registry + persist to disk."""
    _registry_domains.add(domain)
    with open(REGISTRY_PATH, "a", encoding="utf-8") as f:
        f.write(f"\n{domain}")


def _registry_remove(domain: str):
    """Remove domain from in-memory registry + persist to disk."""
    _registry_domains.discard(domain)
    remaining = sorted(_registry_domains)
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(remaining))


def _cache_key(query: str, domain: str = "", limit: int = 10, section: str = "", lang: str = "", content_type: str = "") -> str:
    """Generate a cache key for search results."""
    raw = f"{query}|{domain}|{limit}|{section}|{lang}|{content_type}"
    return hashlib.md5(raw.encode()).hexdigest()


def _cache_get(key: str) -> dict | None:
    """Get a cached search result if not expired."""
    if key in _search_cache:
        ts, result = _search_cache[key]
        if time.time() - ts < SEARCH_CACHE_TTL:
            _search_cache.move_to_end(key)
            return result
        else:
            del _search_cache[key]
    return None


def _cache_set(key: str, result: dict):
    """Store a search result in cache (evicts oldest if full)."""
    _search_cache[key] = (time.time(), result)
    _search_cache.move_to_end(key)
    while len(_search_cache) > SEARCH_CACHE_MAX:
        _search_cache.popitem(last=False)


def _cache_invalidate_domain(domain: str):
    """Remove all cached results that mention a specific domain."""
    keys_to_remove = [k for k, (_, v) in _search_cache.items()
                      if any(h.get("domain") == domain for h in v.get("hits", []))]
    for k in keys_to_remove:
        del _search_cache[k]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: configure Typesense collection, caches, and crawl registry."""
    global _httpx_pool
    logger.info("Starting ProtoContext engine...")

    # Wait for Typesense to be ready
    client = get_client()
    for attempt in range(30):
        try:
            client.collections.retrieve()
            logger.info("Typesense is ready")
            break
        except Exception:
            if attempt < 29:
                await asyncio.sleep(1)
            else:
                logger.error("Typesense not available after 30s")
                raise

    setup_index(client)

    # Initialise API key database
    auth.init_db()

    # Load registry into memory and sync with Typesense
    file_domains = load_registry(REGISTRY_PATH)
    _registry_domains.update(file_domains)

    # Sync: remove domains from registry that have no documents in Typesense
    if _registry_domains:
        stale = set()
        for domain in list(_registry_domains):
            try:
                result = client.collections[COLLECTION_NAME].documents.search({
                    "q": "*", "query_by": "body", "filter_by": f"domain:={domain}", "per_page": 1,
                })
                if result.get("found", 0) == 0:
                    stale.add(domain)
            except Exception:
                stale.add(domain)
        if stale:
            for d in stale:
                _registry_domains.discard(d)
            remaining = sorted(_registry_domains)
            with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
                f.write("\n".join(remaining))
            logger.info(f"Cleaned {len(stale)} stale domains from registry: {stale}")

    logger.info(f"Registry: {len(_registry_domains)} domains")

    # Create global httpx connection pool (reused for all external requests)
    _httpx_pool = httpx.AsyncClient(
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        timeout=httpx.Timeout(30.0),
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )

    # Crawl registry in background (context.txt only — no AI key at startup)
    asyncio.create_task(initial_crawl())

    yield

    # Cleanup
    if _httpx_pool:
        await _httpx_pool.aclose()


async def initial_crawl():
    """Crawl all domains in the registry on startup (context.txt only, no AI)."""
    try:
        domains = load_registry(REGISTRY_PATH)
        logger.info(f"Crawling {len(domains)} domains from registry...")
        results = await crawl_all(domains)  # No ai_key → only context.txt

        client = get_client()
        total = 0
        for result in results:
            if result["documents"]:
                index_documents(result["documents"], client)
                domain = result["documents"][0]["domain"]
                domain_fetch_times[domain] = datetime.now(timezone.utc)
                total += len(result["documents"])

        logger.info(f"Initial crawl complete: {total} documents indexed from {len(results)} sites")
    except Exception as e:
        logger.error(f"Initial crawl failed: {e}")


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="ProtoContext API",
    description="Search engine for the ProtoContext open standard. "
                "Supports context.txt (native) and content conversion via Gemini, OpenAI, or OpenRouter.",
    version="0.1.1-beta",
    lifespan=lifespan,
)

app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many attempts. Try again later."},
    )


class TokenAuthMiddleware(BaseHTTPMiddleware):
    """
    Auth middleware with three operational modes:

    1. Legacy mode  — PROTO_API_TOKEN env var set → check admin token / user API keys
    2. First-run    — no env var + no admin account → block all (force /auth/setup)
    3. Session mode — no env var + admin exists → validate session tokens / API keys
    """
    async def dispatch(self, request: Request, call_next):
        # Skip CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip public endpoints
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        token = request.headers.get("x-proto-token", "")

        # --- MODE 1: Legacy (env var set) ---
        if PROTO_API_TOKEN:
            if token == PROTO_API_TOKEN:
                request.state.is_admin = True
                return await call_next(request)
            if token and auth.validate_key(token):
                request.state.is_admin = False
                return await call_next(request)
            return JSONResponse(status_code=403, content={"detail": "Invalid or missing API token"})

        # --- MODE 2: First-run (no env var + no admin) ---
        if not auth.has_admin():
            return JSONResponse(status_code=403, content={"detail": "Setup required. Complete setup at /auth/setup first."})

        # --- MODE 3: Session-based (admin exists) ---
        if not token:
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})

        if auth.validate_session(token):
            request.state.is_admin = True
            return await call_next(request)

        if auth.validate_key(token):
            request.state.is_admin = False
            return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})


# Token middleware runs BEFORE CORS (added first = runs last in stack, but
# BaseHTTPMiddleware wraps inner, so we add CORS first, then token)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "x-proto-token", "x-ai-key", "x-ai-model"],
    expose_headers=["*"],
)

app.add_middleware(TokenAuthMiddleware)


# --- Request/Response models ---

class BatchQuery(BaseModel):
    q: str
    domain: Optional[str] = None
    lang: Optional[str] = None
    content_type: Optional[str] = None
    limit: int = 5

class BatchRequest(BaseModel):
    queries: list[BatchQuery]

class SubmitRequest(BaseModel):
    domain: str
    ai_key: Optional[str] = None
    ai_model: Optional[str] = None

class SearchResult(BaseModel):
    domain: str
    section: str
    body: str
    url: str
    updated: str
    lang: str
    freshness: str
    content_type: str
    location: str
    action_url: str

class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    latency_ms: int


# --- Helpers ---

def _resolve_ai_params(
    ai_key: Optional[str] = None,
    ai_model: Optional[str] = None,
) -> tuple[str, str]:
    """Resolve AI parameters. Returns (ai_key, ai_model)."""
    return (ai_key or "", ai_model or "")


async def ensure_domain_indexed(domain: str, ai_key: str = "", ai_model: str = "") -> str:
    """
    If a domain is not in the index (or stale), fetch its content
    and index it in real time.

    Returns freshness status: "cached", "live", or "miss".

    Optimized: uses in-memory registry + fetch_times for O(1) lookups,
    no search query for freshness checks.
    """
    # Fast path: check in-memory timestamp cache
    last_fetch = domain_fetch_times.get(domain)
    if last_fetch and (datetime.now(timezone.utc) - last_fetch) < timedelta(days=CACHE_TTL_DAYS):
        return "cached"

    # Check if domain is in registry (already indexed at some point)
    if domain in _registry_domains:
        domain_fetch_times[domain] = datetime.now(timezone.utc)
        return "cached"

    # Not cached — fetch and index in real time
    result = await fetch_context(domain, ai_key=ai_key, ai_model=ai_model)
    if result and result["documents"]:
        index_documents(result["documents"])
        domain_fetch_times[domain] = datetime.now(timezone.utc)
        # Typesense indexing is synchronous — no wait needed
        return "live"

    return "miss"


def format_hit(hit: dict, freshness: str = "cached") -> dict:
    """Convert a search hit to our response format."""
    return {
        "domain": hit.get("domain", ""),
        "section": hit.get("title", ""),
        "body": hit.get("body", ""),
        "url": hit.get("url", ""),
        "updated": hit.get("updated", ""),
        "lang": hit.get("lang", "en"),
        "freshness": freshness,
        "content_type": hit.get("content_type", "website"),
        "location": hit.get("location", ""),
        "action_url": hit.get("action_url", ""),
    }


# --- Endpoints ---

@app.get("/search", response_model=SearchResponse)
async def search_endpoint(
    q: str = Query(default="", description="Search query"),
    domain: Optional[str] = Query(default=None, description="Filter by domain"),
    section: Optional[str] = Query(default=None, description="Filter by section slug"),
    lang: Optional[str] = Query(default=None, description="Filter by language code (en, es, fr, it, de, pt, pl, zh, fi, sv, no, da, ja)"),
    content_type: Optional[str] = Query(default=None, description="Filter by PCE content type (website, hospitality, ecommerce, tours, room, product, tour, action, policy)"),
    limit: int = Query(default=10, ge=1, le=100, description="Max results"),
    ai_key: Optional[str] = Header(default=None, alias="x-ai-key", description="API key for AI provider"),
    ai_model: Optional[str] = Header(default=None, alias="x-ai-model", description="AI model in provider/model format"),
):
    """
    Search indexed context.txt content.

    - No domain: searches all indexed sites
    - With domain: searches only that domain (fetches in real-time if not indexed)
    - With lang: filters results by language code
    - With content_type: filters by PCE content type (website, hospitality, ecommerce, tours, room, product, tour, action, policy)
    - With ai_key: enables content conversion for new domains via Gemini, OpenAI, or OpenRouter

    Pass AI credentials via headers (x-ai-key, x-ai-model).
    """
    start = time.time()
    freshness = "cached"

    key, model = _resolve_ai_params(ai_key, ai_model)

    if domain:
        freshness = await ensure_domain_indexed(domain, ai_key=key, ai_model=model)

    # Check LRU cache first (only for cached domains — live fetches skip cache)
    ck = _cache_key(q, domain or "", limit, section or "", lang or "", content_type or "")
    if freshness == "cached":
        cached = _cache_get(ck)
        if cached is not None:
            hits = [format_hit(hit, freshness) for hit in cached.get("hits", [])]
            latency = int((time.time() - start) * 1000)
            return {"query": q, "results": hits, "latency_ms": latency}

    try:
        result = engine_search(
            query=q,
            domain=domain,
            section=section,
            lang=lang,
            content_type=content_type,
            limit=limit,
        )
    except TypesenseClientError as e:
        raise HTTPException(status_code=500, detail=f"Search error: {e}")

    # Store in cache
    _cache_set(ck, result)

    hits = [format_hit(hit, freshness) for hit in result.get("hits", [])]
    latency = int((time.time() - start) * 1000)

    return {
        "query": q,
        "results": hits,
        "latency_ms": latency,
    }


@app.get("/site")
async def site_endpoint(
    domain: str = Query(..., description="Domain to retrieve"),
    lang: Optional[str] = Query(default=None, description="Filter by language code"),
    content_type: Optional[str] = Query(default=None, description="Filter by PCE content type"),
    ai_key: Optional[str] = Header(default=None, alias="x-ai-key"),
    ai_model: Optional[str] = Header(default=None, alias="x-ai-model"),
):
    """Get all sections for a specific domain. Pass AI credentials via x-ai-key / x-ai-model headers."""
    start = time.time()

    key, model = _resolve_ai_params(ai_key, ai_model)
    freshness = await ensure_domain_indexed(domain, ai_key=key, ai_model=model)

    try:
        result = engine_search(query="", domain=domain, lang=lang, content_type=content_type, limit=100)
    except TypesenseClientError as e:
        raise HTTPException(status_code=500, detail=f"Search error: {e}")

    hits = result.get("hits", [])
    if not hits:
        raise HTTPException(status_code=404, detail=f"No context found for {domain}")

    latency = int((time.time() - start) * 1000)

    return {
        "domain": domain,
        "sections": [format_hit(hit, freshness) for hit in hits],
        "total_sections": len(hits),
        "latency_ms": latency,
    }


@app.post("/batch")
async def batch_endpoint(
    request: BatchRequest,
    ai_key: Optional[str] = Header(default=None, alias="x-ai-key"),
    ai_model: Optional[str] = Header(default=None, alias="x-ai-model"),
):
    """Execute multiple search queries in one request. Pass AI credentials via x-ai-key / x-ai-model headers."""
    start = time.time()

    if len(request.queries) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 queries per batch")

    key, model = _resolve_ai_params(ai_key, ai_model)

    results = []
    for bq in request.queries:
        if bq.domain:
            await ensure_domain_indexed(bq.domain, ai_key=key, ai_model=model)

        try:
            result = engine_search(query=bq.q, domain=bq.domain, lang=bq.lang, content_type=bq.content_type, limit=bq.limit)
            hits = [format_hit(hit) for hit in result.get("hits", [])]
            results.append({
                "query": bq.q,
                "results": hits,
            })
        except TypesenseClientError:
            results.append({
                "query": bq.q,
                "results": [],
                "error": "search failed",
            })

    latency = int((time.time() - start) * 1000)

    return {
        "batch_results": results,
        "total_queries": len(request.queries),
        "latency_ms": latency,
    }


@app.post("/submit")
async def submit_endpoint(request: SubmitRequest):
    """
    Submit a domain to the registry.

    - If the site has /context.txt → works directly, no API key needed.
    - If the site needs conversion → requires ai_key (and optionally ai_model).
    - The API key is used once for conversion and is never stored.
    """
    domain = request.domain.strip().replace("https://", "").replace("http://", "").rstrip("/")

    if not domain:
        raise HTTPException(status_code=400, detail="Domain is required")

    # Check if already registered (O(1) in-memory check)
    if domain in _get_registry():
        return {"status": "already_registered", "domain": domain}

    key, model = _resolve_ai_params(request.ai_key, request.ai_model)

    # Try to fetch content
    result = await fetch_context(domain, ai_key=key, ai_model=model)

    if not result or not result["documents"]:
        hint = ""
        if not key:
            hint = " Provide an ai_key (and optionally ai_model) to enable AI-powered content conversion."
        raise HTTPException(
            status_code=400,
            detail=f"No valid AI-readable content found for {domain}.{hint}",
        )

    # Add to registry (in-memory + disk)
    _registry_add(domain)

    # Index the documents
    index_documents(result["documents"])
    domain_fetch_times[domain] = datetime.now(timezone.utc)

    return {
        "status": "registered",
        "domain": domain,
        "sections_indexed": len(result["documents"]),
        "source_format": result.get("source_format", "context"),
        "source_path": result.get("source_path", "/context.txt"),
    }


@app.post("/submit-stream")
async def submit_stream_endpoint(request: SubmitRequest):
    """
    Submit a domain with Server-Sent Events for real-time progress.

    Sends events like:
      data: {"step": "checking", "message": "Checking context.txt..."}
      data: {"step": "scraping", "message": "Scraping pages...", "progress": 30}
      data: {"step": "done", "result": {...}}
      data: {"step": "error", "message": "..."}
    """
    domain = request.domain.strip().replace("https://", "").replace("http://", "").rstrip("/")
    if not domain:
        raise HTTPException(status_code=400, detail="Domain is required")

    key, model = _resolve_ai_params(request.ai_key, request.ai_model)

    async def event_stream() -> AsyncGenerator[str, None]:
        def sse(data: dict) -> str:
            return f"data: {json.dumps(data)}\n\n"

        # Check if already registered (O(1) in-memory)
        if domain in _get_registry():
            yield sse({"step": "done", "result": {"status": "already_registered", "domain": domain}})
            return

        root_domain = _extract_root_domain(domain)
        client = _httpx_pool or httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True)

        # --- Step 1-3: Try context.txt, llms-full.txt, llms.txt ---
        result = None
        for path in FETCH_PATHS:
            yield sse({"step": "checking", "message": f"Checking {path}...", "path": path})
            try:
                r = await _try_fetch_path(domain, path, client, key, model)
                if r:
                    result = r
                    yield sse({"step": "found", "message": f"Found content at {path}", "path": path, "sections": len(r["documents"])})
                    break
            except Exception:
                pass

        # --- Step 4: Sitemap scraping ---
        if not result and key:
            yield sse({"step": "sitemap", "message": "Fetching sitemap..."})
            scraped = None

            try:
                urls = await fetch_sitemap_urls(root_domain, client, max_pages=500)

                if not urls:
                    yield sse({"step": "crawling", "message": "No sitemap found, crawling internal links..."})
                    urls = await _crawl_internal_links(root_domain, client, max_pages=30)
                    if not urls:
                        yield sse({"step": "sitemap", "message": "No links found, scraping homepage only..."})
                        scraped = await scrape_site_content(root_domain, client, max_pages=30)
                    else:
                        yield sse({"step": "crawling", "message": f"Discovered {len(urls)} pages via links", "total": len(urls), "progress": 15})

                if urls:
                    urls = _filter_best_language_urls(urls, MAX_PAGES)
                    total_urls = len(urls)
                    selected_urls = urls[:30]
                    yield sse({"step": "scraping", "message": f"Found {total_urls} pages, scraping {len(selected_urls)}...", "total": len(selected_urls), "scraped": 0, "progress": 0})

                    # Scrape pages in batches with progress
                    sections = [f"# Scraped content from: {domain}\n"]
                    pages_scraped = 0
                    BATCH_SIZE = 10

                    for i in range(0, len(selected_urls), BATCH_SIZE):
                        batch = selected_urls[i : i + BATCH_SIZE]
                        results_batch = await asyncio.gather(
                            *(scrape_page_content(url, client) for url in batch),
                            return_exceptions=True,
                        )

                        for url, content in zip(batch, results_batch):
                            if isinstance(content, Exception) or not content or len(content) <= 100:
                                continue
                            path_part = urlparse(url).path or "/"
                            page_title = _path_to_title(path_part)
                            sections.append(f"\n## Page: {page_title} ({path_part})\n\n{content}")
                            pages_scraped += 1

                        progress = int((min(i + BATCH_SIZE, len(selected_urls)) / len(selected_urls)) * 70)
                        yield sse({"step": "scraping", "message": f"Scraped {pages_scraped} pages...", "total": len(selected_urls), "scraped": pages_scraped, "progress": progress})

                    if pages_scraped > 0:
                        scraped = "\n".join(sections)
                    else:
                        scraped = None

                if scraped:
                    yield sse({"step": "converting", "message": "Converting with AI...", "progress": 75})

                    today = date.today().strftime("%Y-%m-%d")
                    lang = _detect_language(scraped)
                    converted = await convert_scraped_to_context(scraped, domain, today, key, lang, model)

                    if converted:
                        r = parse(converted, domain)
                        if r:
                            r["source_path"] = "/sitemap.xml"
                            r["source_format"] = "sitemap_scraped"
                            result = r
                            yield sse({"step": "converted", "message": f"Converted to {len(r['documents'])} sections", "sections": len(r["documents"]), "progress": 90})

            except Exception as e:
                logger.error(f"Streaming submit scrape failed: {e}")
                yield sse({"step": "error", "message": f"Scraping failed: {str(e)}"})
                return

        if not result or not result["documents"]:
            hint = ""
            if not key:
                hint = " Provide an AI key to enable content conversion."
            yield sse({"step": "error", "message": f"No AI-readable content found for {domain}.{hint}"})
            return

        # Index
        yield sse({"step": "indexing", "message": "Indexing...", "progress": 95})

        _registry_add(domain)
        index_documents(result["documents"])
        domain_fetch_times[domain] = datetime.now(timezone.utc)

        yield sse({"step": "done", "result": {
            "status": "registered",
            "domain": domain,
            "sections_indexed": len(result["documents"]),
            "source_format": result.get("source_format", "context"),
            "source_path": result.get("source_path", "/context.txt"),
        }, "progress": 100})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class DeleteRequest(BaseModel):
    domain: str


@app.post("/delete")
async def delete_endpoint(request: DeleteRequest):
    """
    Remove a domain from the index and registry.

    Deletes all indexed documents for the domain, removes it from the
    registry file, and clears it from the in-memory cache.
    """
    domain = request.domain.strip().replace("https://", "").replace("http://", "").rstrip("/")

    if not domain:
        raise HTTPException(status_code=400, detail="Domain is required")

    # Check if domain has any documents
    try:
        result = engine_search(query="", domain=domain, limit=1)
        has_docs = bool(result.get("hits"))
        sections_deleted_est = result.get("found", 0)
    except Exception:
        has_docs = False
        sections_deleted_est = 0

    # Check if in registry (O(1) in-memory)
    in_registry = domain in _get_registry()

    if not has_docs and not in_registry:
        raise HTTPException(status_code=404, detail=f"Domain {domain} not found in index or registry")

    # Delete from Typesense
    sections_deleted = 0
    if has_docs:
        sections_deleted = sections_deleted_est
        delete_domain(domain)

    # Remove from registry (in-memory + disk)
    if in_registry:
        _registry_remove(domain)

    # Clear from caches
    domain_fetch_times.pop(domain, None)
    _cache_invalidate_domain(domain)

    logger.info(f"Deleted domain {domain}: {sections_deleted} sections removed")

    return {
        "status": "deleted",
        "domain": domain,
        "sections_deleted": sections_deleted,
        "removed_from_registry": in_registry,
    }


@app.get("/stats")
async def stats_endpoint():
    """Get engine statistics."""
    index_stats = get_stats()

    return {
        "total_documents": index_stats["total_documents"],
        "is_indexing": index_stats["is_indexing"],
        "registered_domains": len(_registry_domains),
        "cached_domains": len(domain_fetch_times),
        "search_cache_size": len(_search_cache),
        "cache_ttl_days": CACHE_TTL_DAYS,
    }


@app.get("/health")
async def health():
    """Health check."""
    try:
        client = get_client()
        client.collections.retrieve()
        return {"status": "ok", "typesense": "connected"}
    except Exception:
        return {"status": "degraded", "typesense": "disconnected"}


# --- API Key Management (admin-only) ---

class CreateKeyRequest(BaseModel):
    name: str = ""


def _require_admin(request: Request):
    """Raise 403 if the caller is not an admin (admin token or session)."""
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin token required to manage API keys")


@app.post("/api-keys")
async def create_api_key(body: CreateKeyRequest, request: Request):
    """
    Generate a new API key (admin-only).

    The full key is returned **only once** in the response.
    Store it securely — it cannot be retrieved later.
    """
    _require_admin(request)
    result = auth.generate_key(name=body.name)
    return result


@app.get("/api-keys")
async def list_api_keys(request: Request):
    """List all API keys with metadata (admin-only). Hashes are never exposed."""
    _require_admin(request)
    return auth.list_keys()


@app.delete("/api-keys/{key_id}")
async def revoke_api_key(key_id: int, request: Request):
    """Revoke an API key by ID (admin-only)."""
    _require_admin(request)
    if auth.revoke_key(key_id):
        return {"detail": "Key revoked", "id": key_id}
    raise HTTPException(status_code=404, detail=f"Key {key_id} not found or already revoked")


# --- Settings (admin AI config, persisted in SQLite) ---

class SettingsRequest(BaseModel):
    ai_provider: Optional[str] = None
    ai_key: Optional[str] = None
    ai_model: Optional[str] = None


@app.get("/settings")
async def get_settings(request: Request):
    """Get saved admin settings (AI provider config)."""
    _require_admin(request)
    return auth.get_settings()


@app.put("/settings")
async def save_settings(body: SettingsRequest, request: Request):
    """Save admin settings (AI provider config). Empty values are cleared."""
    _require_admin(request)
    auth.save_settings({
        "ai_provider": body.ai_provider or "",
        "ai_key": body.ai_key or "",
        "ai_model": body.ai_model or "",
    })
    return {"status": "saved"}


# --- Auth: Setup / Login / Logout ---

class SetupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str


@app.get("/auth/status")
async def auth_status():
    """
    Check the auth state of this installation.

    - needs_setup: true if no admin account and no PROTO_API_TOKEN env var
    - legacy_mode: true if PROTO_API_TOKEN env var is set
    """
    legacy = bool(PROTO_API_TOKEN)
    needs_setup = not legacy and not auth.has_admin()
    return {"needs_setup": needs_setup, "legacy_mode": legacy}


@app.post("/auth/setup")
@limiter.limit("5/minute")
async def auth_setup(request: Request, body: SetupRequest):
    """
    First-run setup: create the admin account and return a session token.

    Only works when no admin exists and no PROTO_API_TOKEN is set.
    The session token is returned once — store it securely.
    """
    if PROTO_API_TOKEN:
        raise HTTPException(status_code=400, detail="Setup not available in legacy mode (PROTO_API_TOKEN is set)")

    if auth.has_admin():
        raise HTTPException(status_code=400, detail="Admin account already exists. Use /auth/login instead.")

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not body.email or "@" not in body.email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    admin = auth.create_admin(body.name.strip(), body.email.strip().lower(), body.password)
    token = auth.create_session()

    return {"status": "created", "token": token, "admin": admin}


@app.post("/auth/login")
@limiter.limit("5/minute")
async def auth_login(request: Request, body: LoginRequest):
    """Login with email + password.  Returns a session token."""
    if PROTO_API_TOKEN:
        raise HTTPException(status_code=400, detail="Login not available in legacy mode")

    if not auth.has_admin():
        raise HTTPException(status_code=400, detail="No admin account. Complete setup first.")

    if not auth.verify_admin(body.email.strip().lower(), body.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = auth.create_session()
    return {"status": "ok", "token": token}


@app.post("/auth/logout")
async def auth_logout(request: Request):
    """Invalidate the current session token."""
    token = request.headers.get("x-proto-token", "")
    if token and auth.invalidate_session(token):
        return {"status": "logged_out"}
    raise HTTPException(status_code=400, detail="No active session to invalidate")
