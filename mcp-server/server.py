"""
ProtoContext MCP Server — search AI-readable web content from any AI agent.

Exposes the ProtoContext search engine as MCP tools so that Claude,
Cursor, Windsurf, or any MCP-compatible AI agent can query structured
website context in real time.

Tools:
    protocontext_search  — full-text search across all indexed sites
    protocontext_site    — get all context sections for a domain
    protocontext_submit  — register a new domain to the index
    protocontext_delete  — remove a domain from the index
    protocontext_stats   — index statistics and health

Usage (stdio, for Claude Code / Claude Desktop):
    uv run server.py

Usage (SSE, for remote access):
    uv run server.py --sse
"""

import sys
import os
import logging
from typing import Optional

from mcp.server.fastmcp import FastMCP
import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_BASE = os.environ.get("PROTOCONTEXT_API_BASE", "https://api.protocontext.org")
API_TOKEN = os.environ.get("PROTOCONTEXT_API_TOKEN", os.environ.get("PROTO_API_TOKEN", "")).strip()
TIMEOUT = 30.0

# Logging goes to stderr so it doesn't corrupt the stdio JSON-RPC stream
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("protocontext.mcp")

# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------

mcp = FastMCP("protocontext")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get(path: str, params: dict | None = None, headers: dict | None = None) -> dict:
    """Make a GET request to the ProtoContext API."""
    req_headers = dict(headers or {})
    if API_TOKEN:
        req_headers["x-proto-token"] = API_TOKEN
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(f"{API_BASE}{path}", params=params, headers=req_headers or None)
        r.raise_for_status()
        return r.json()


async def _post(path: str, json: dict, headers: dict | None = None) -> dict:
    """Make a POST request to the ProtoContext API."""
    req_headers = dict(headers or {})
    if API_TOKEN:
        req_headers["x-proto-token"] = API_TOKEN
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(f"{API_BASE}{path}", json=json, headers=req_headers or None)
        r.raise_for_status()
        return r.json()


def _format_results(results: list[dict]) -> str:
    """Format search results into readable text for the AI agent."""
    if not results:
        return "No results found."

    parts = []
    for i, hit in enumerate(results, 1):
        domain = hit.get("domain", "")
        section = hit.get("section", "")
        body = hit.get("body", "")
        url = hit.get("url", "")
        updated = hit.get("updated", "")

        header = f"## [{i}] {section}"
        if domain:
            header += f"  ({domain})"

        part = f"{header}\n\n{body}"

        meta = []
        if url:
            meta.append(f"URL: {url}")
        if updated:
            meta.append(f"Updated: {updated}")
        if meta:
            part += f"\n\n_{'  |  '.join(meta)}_"

        parts.append(part)

    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def protocontext_search(
    query: str,
    domain: Optional[str] = None,
    limit: int = 10,
) -> str:
    """Search AI-readable content across all indexed websites.

    Use this to find structured information about any topic from real websites.
    Results come from context.txt files, llms.txt, or AI-converted web content.

    Args:
        query: What to search for (e.g. "payment processing", "authentication flow")
        domain: Filter results to a specific domain (e.g. "stripe.com"). Optional.
        limit: Maximum number of results to return (1-100, default 10)
    """
    params: dict = {"q": query, "limit": min(max(limit, 1), 100)}
    if domain:
        params["domain"] = domain.strip().replace("https://", "").replace("http://", "").rstrip("/")

    try:
        data = await _get("/search", params=params)
        results = data.get("results", [])
        latency = data.get("latency_ms", "?")

        output = _format_results(results)
        output += f"\n\n---\n_Found {len(results)} results in {latency}ms_"
        return output

    except httpx.HTTPStatusError as e:
        return f"Search error ({e.response.status_code}): {e.response.text}"
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return f"Search failed: {str(e)}"


@mcp.tool()
async def protocontext_site(
    domain: str,
) -> str:
    """Get all structured context sections for a specific website.

    Returns the complete AI-readable content that has been indexed for a domain.
    Use this when you need comprehensive information about a specific site.

    Args:
        domain: The website domain (e.g. "stripe.com", "docs.github.com")
    """
    clean = domain.strip().replace("https://", "").replace("http://", "").rstrip("/")
    if not clean:
        return "Error: domain is required"

    try:
        data = await _get("/site", params={"domain": clean})
        sections = data.get("sections", [])
        total = data.get("total_sections", len(sections))
        latency = data.get("latency_ms", "?")

        if not sections:
            return f"No content indexed for {clean}. Use protocontext_submit to register it first."

        output = f"# {clean} — {total} sections\n\n"
        output += _format_results(sections)
        output += f"\n\n---\n_Retrieved {total} sections in {latency}ms_"
        return output

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return f"Domain {clean} not found. Use protocontext_submit to register it."
        return f"Site error ({e.response.status_code}): {e.response.text}"
    except Exception as e:
        logger.error(f"Site fetch failed: {e}")
        return f"Site fetch failed: {str(e)}"


@mcp.tool()
async def protocontext_submit(
    domain: str,
    ai_key: Optional[str] = None,
    ai_model: Optional[str] = None,
) -> str:
    """Register a new website domain to the ProtoContext search index.

    Sites with /context.txt work directly without an AI key.
    Sites without it need an AI provider key to convert their content.

    Args:
        domain: Domain to register (e.g. "example.com", "docs.mysite.io")
        ai_key: API key for the AI provider. Required if the site has no context.txt.
        ai_model: AI model in provider/name format (e.g. "gemini/gemini-3-flash-preview"). Optional.
    """
    clean = domain.strip().replace("https://", "").replace("http://", "").rstrip("/")
    if not clean:
        return "Error: domain is required"

    body: dict = {"domain": clean}
    if ai_key:
        body["ai_key"] = ai_key
    if ai_model:
        body["ai_model"] = ai_model

    try:
        data = await _post("/submit", json=body)
        status = data.get("status", "unknown")
        sections = data.get("sections_indexed", 0)
        source = data.get("source_format", "")
        path = data.get("source_path", "")

        if status == "already_registered":
            return f"{clean} is already registered in the index."

        parts = [f"Successfully registered {clean}"]
        if sections:
            parts.append(f"{sections} sections indexed")
        if source:
            parts.append(f"Source: {source}")
        if path:
            parts.append(f"Path: {path}")

        return " | ".join(parts)

    except httpx.HTTPStatusError as e:
        return f"Submit error ({e.response.status_code}): {e.response.text}"
    except Exception as e:
        logger.error(f"Submit failed: {e}")
        return f"Submit failed: {str(e)}"


@mcp.tool()
async def protocontext_delete(
    domain: str,
) -> str:
    """Remove a domain and all its content from the ProtoContext index.

    This deletes all indexed sections and removes the domain from the registry.

    Args:
        domain: Domain to remove (e.g. "example.com")
    """
    clean = domain.strip().replace("https://", "").replace("http://", "").rstrip("/")
    if not clean:
        return "Error: domain is required"

    try:
        data = await _post("/delete", json={"domain": clean})
        sections = data.get("sections_deleted", 0)
        registry = data.get("removed_from_registry", False)

        parts = [f"Deleted {clean}"]
        parts.append(f"{sections} sections removed")
        if registry:
            parts.append("removed from registry")

        return " | ".join(parts)

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return f"Domain {clean} not found in index or registry."
        return f"Delete error ({e.response.status_code}): {e.response.text}"
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        return f"Delete failed: {str(e)}"


@mcp.tool()
async def protocontext_stats() -> str:
    """Get ProtoContext index statistics and health status.

    Returns the number of indexed documents, registered domains,
    cache info, and engine health.
    """
    try:
        stats, health = None, None

        try:
            stats = await _get("/stats")
        except Exception:
            pass

        try:
            health = await _get("/health")
        except Exception:
            pass

        parts = ["# ProtoContext Stats\n"]

        if stats:
            parts.append(f"- **Documents indexed:** {stats.get('total_documents', 0)}")
            parts.append(f"- **Registered domains:** {stats.get('registered_domains', 0)}")
            parts.append(f"- **Cached domains:** {stats.get('cached_domains', 0)}")
            parts.append(f"- **Cache TTL:** {stats.get('cache_ttl_days', '?')} days")

        if health:
            api_status = health.get("status", "unknown")
            ts_status = health.get("typesense", "unknown")
            parts.append(f"- **API:** {api_status}")
            parts.append(f"- **Typesense:** {ts_status}")

        if not stats and not health:
            return "Could not connect to ProtoContext API at " + API_BASE

        return "\n".join(parts)

    except Exception as e:
        logger.error(f"Stats failed: {e}")
        return f"Stats failed: {str(e)}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    """Run the ProtoContext MCP server."""
    transport = "stdio"

    if API_TOKEN:
        logger.info("Auth enabled via PROTOCONTEXT_API_TOKEN/PROTO_API_TOKEN")
    else:
        logger.warning("No API token configured (PROTOCONTEXT_API_TOKEN/PROTO_API_TOKEN). Protected endpoints may fail.")

    # Check for --sse flag for remote mode
    if "--sse" in sys.argv:
        transport = "sse"
        logger.info("Starting ProtoContext MCP server (SSE transport)")
    else:
        logger.info("Starting ProtoContext MCP server (stdio transport)")

    mcp.run(transport=transport)


if __name__ == "__main__":
    main()
