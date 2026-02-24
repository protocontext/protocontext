"""
ProtoContext crawler — fetches AI-readable content from domains.

Fallback chain per domain:
  1. /context.txt        (ProtoContext native — parse directly, no API key needed)
  1b. /context.{lang}.txt (language variants — fetched in parallel, no API key needed)
  2. /llms-full.txt      (full content — convert via AI if key provided)
  3. /llms.txt           (index with links — follow links, convert via AI if key provided)
  4. sitemap.xml         (scrape pages — convert via AI if key provided)

Supports multiple AI providers: Gemini, OpenAI, OpenRouter.
The AI key and model are passed per-request (by the caller), never stored.
"""

import os
import asyncio
import logging
from datetime import date
from typing import Optional

import httpx

from parser import parse, is_context_format, is_llms_format
from converter import fetch_and_convert, convert_scraped_to_context, _detect_language
from scraper import scrape_site_content

logger = logging.getLogger("protocontext.crawler")

_DEFAULT_REGISTRY = os.path.join(os.path.dirname(__file__), "..", "registry", "sites.txt")
_DOCKER_REGISTRY = "/app/registry/sites.txt"
REGISTRY_PATH = _DOCKER_REGISTRY if os.path.exists(_DOCKER_REGISTRY) else _DEFAULT_REGISTRY

USER_AGENT = "ProtoContext-Crawler/1.0"
FETCH_TIMEOUT = 10.0

# Ordered list of paths to try per domain (steps 1-3)
FETCH_PATHS = [
    "/context.txt",
    "/llms-full.txt",
    "/llms.txt",
]

# Supported language codes for /context.{lang}.txt variants
SUPPORTED_LANGS = [
    "en", "es", "fr", "it", "de", "pt", "pl", "zh", "fi", "sv", "no", "da", "ja",
]


def _extract_root_domain(domain: str) -> str:
    """
    Extract the root domain from a domain that may include a path.
    e.g. "www.mollie.com/it" → "www.mollie.com"
    """
    return domain.split("/")[0]


def load_registry(path: str = REGISTRY_PATH) -> list[str]:
    """Load domains from the registry file."""
    domains = []
    if not os.path.exists(path):
        logger.warning(f"Registry file not found: {path}")
        return domains

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                domain = line.replace("https://", "").replace("http://", "").rstrip("/")
                domains.append(domain)

    return domains


async def fetch_context(
    domain: str,
    client: Optional[httpx.AsyncClient] = None,
    ai_key: str = "",
    ai_model: str = "",
) -> Optional[dict]:
    """
    Fetch and parse AI-readable content from a domain.

    Fallback chain:
      1. /context.txt → parse directly (no API key needed)
      2. /llms-full.txt → convert via AI (needs key)
      3. /llms.txt → follow links + convert via AI (needs key)
      4. sitemap.xml → scrape pages + convert via AI (needs key)

    Returns parsed result dict or None.
    """
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True)

    try:
        # --- Steps 1-3: Try context.txt, llms-full.txt, llms.txt ---
        llms_result = None
        context_result = None
        for path in FETCH_PATHS:
            result = await _try_fetch_path(domain, path, client, ai_key, ai_model)
            if result:
                if path == "/context.txt":
                    context_result = result
                    break  # found context.txt — also check lang variants below
                elif path == "/llms-full.txt":
                    logger.info(f"{domain}: got {len(result['documents'])} sections from {path}")
                    return result
                else:
                    # llms.txt — also try sitemap for richer content
                    llms_result = result
                    break

        # --- Step 1b: Language variants /context.{lang}.txt ---
        # Only if the domain has a native /context.txt (no point checking variants otherwise)
        if context_result is not None:
            lang_docs = await _try_fetch_lang_variants(domain, client)
            all_docs = context_result["documents"] + lang_docs
            variants = list({d.get("lang", "en") for d in all_docs})
            logger.info(f"{domain}: got {len(all_docs)} sections from context.txt ({len(variants)} lang(s): {', '.join(sorted(variants))})")
            context_result["documents"] = all_docs
            if len(variants) > 1:
                context_result["variants_found"] = sorted(variants)
            return context_result

        # --- Step 4: Sitemap scraping ---
        # Always try if we have an AI key and didn't get a definitive result above
        if ai_key:
            sitemap_result = await _try_sitemap_scrape(domain, client, ai_key, ai_model)

            if sitemap_result and llms_result:
                # Pick whichever has more sections (richer content)
                llms_docs = len(llms_result["documents"])
                sitemap_docs = len(sitemap_result["documents"])
                if sitemap_docs > llms_docs:
                    logger.info(f"{domain}: sitemap ({sitemap_docs} sections) richer than llms.txt ({llms_docs}), using sitemap")
                    return sitemap_result
                else:
                    logger.info(f"{domain}: llms.txt ({llms_docs} sections) richer than sitemap ({sitemap_docs}), using llms.txt")
                    return llms_result
            elif sitemap_result:
                return sitemap_result

        if llms_result:
            logger.info(f"{domain}: got {len(llms_result['documents'])} sections from /llms.txt")
            return llms_result

        logger.info(f"{domain}: no AI-readable content found")
        return None

    finally:
        if own_client:
            await client.aclose()


async def _try_fetch_lang_variants(
    domain: str,
    client: httpx.AsyncClient,
) -> list[dict]:
    """
    Fetch all language-specific context.txt variants in parallel.

    Tries /context.{lang}.txt for each supported language.
    Returns a flat list of documents from all found variants.
    Each document already has its `lang` field set by the parser (@lang metadata)
    or injected from the filename if the file omits @lang.
    """

    async def _fetch_one(lang: str) -> list[dict]:
        path = f"/context.{lang}.txt"
        url = f"https://{domain}{path}"
        try:
            resp = await client.get(url, headers={"User-Agent": USER_AGENT})
            if resp.status_code != 200:
                return []

            content_type = resp.headers.get("content-type", "")
            if "text/html" in content_type:
                return []

            content = resp.text
            if not content or len(content.strip()) < 20:
                return []

            if not is_context_format(content):
                return []

            result = parse(content, domain)
            if not result or not result["documents"]:
                return []

            # If the file has no @lang metadata, inject from filename
            file_lang = result.get("metadata", {}).get("lang", "")
            if not file_lang:
                for doc in result["documents"]:
                    doc["lang"] = lang

            result["source_path"] = path
            logger.info(f"{domain}: found {len(result['documents'])} sections in {path}")
            return result["documents"]

        except (httpx.TimeoutException, httpx.RequestError):
            return []

    tasks = [_fetch_one(lang) for lang in SUPPORTED_LANGS]
    results = await asyncio.gather(*tasks)

    # Flatten all documents from all variants
    all_docs: list[dict] = []
    for docs in results:
        all_docs.extend(docs)

    return all_docs


async def _try_fetch_path(
    domain: str,
    path: str,
    client: httpx.AsyncClient,
    ai_key: str = "",
    ai_model: str = "",
) -> Optional[dict]:
    """Try to fetch and parse a specific path from a domain."""
    url = f"https://{domain}{path}"

    try:
        resp = await client.get(url, headers={"User-Agent": USER_AGENT})

        if resp.status_code != 200:
            return None

        content_type = resp.headers.get("content-type", "")
        if "text/html" in content_type:
            return None

        content = resp.text
        if not content or len(content.strip()) < 20:
            return None

        # --- Path 1: Native context.txt → parse directly (no AI needed) ---
        if is_context_format(content):
            result = parse(content, domain)
            if result:
                result["source_path"] = path
                return result

        # --- Path 2-3: llms.txt / llms-full.txt → convert via AI then parse ---
        if is_llms_format(content) or path in ("/llms-full.txt", "/llms.txt"):
            if not ai_key:
                logger.info(f"{domain}: found {path} but no AI key to convert")
                return None

            today = date.today().strftime("%Y-%m-%d")
            converted = await fetch_and_convert(domain, content, path, today, ai_key, ai_model)

            if converted:
                result = parse(converted, domain)
                if result:
                    result["source_path"] = path
                    result["source_format"] = "llms_converted"
                    return result
                else:
                    logger.warning(f"{domain}: AI output didn't parse as context.txt")
            else:
                logger.warning(f"{domain}: AI conversion failed for {path}")

        return None

    except httpx.TimeoutException:
        return None
    except httpx.RequestError:
        return None


async def _try_sitemap_scrape(
    domain: str,
    client: httpx.AsyncClient,
    ai_key: str,
    ai_model: str = "",
) -> Optional[dict]:
    """
    Step 4: Scrape the website via sitemap.xml and convert to context.txt.
    This is the last resort — only called when steps 1-3 all fail.
    Uses root domain for sitemap lookup (sitemaps live at the domain root).
    """
    root_domain = _extract_root_domain(domain)
    logger.info(f"{domain}: trying sitemap scraping (last resort, root={root_domain})...")

    try:
        scraped = await scrape_site_content(root_domain, client, max_pages=30)

        if not scraped:
            logger.info(f"{domain}: sitemap scraping returned no content")
            return None

        today = date.today().strftime("%Y-%m-%d")
        lang = _detect_language(scraped)
        converted = await convert_scraped_to_context(scraped, domain, today, ai_key, lang, ai_model)

        if converted:
            result = parse(converted, domain)
            if result:
                result["source_path"] = "/sitemap.xml"
                result["source_format"] = "sitemap_scraped"
                logger.info(f"{domain}: got {len(result['documents'])} sections from sitemap scraping")
                return result
            else:
                logger.warning(f"{domain}: AI output from scraped content didn't parse")
        else:
            logger.warning(f"{domain}: AI conversion failed for scraped content")

    except Exception as e:
        logger.error(f"{domain}: sitemap scraping failed: {e}")

    return None


async def crawl_all(
    domains: Optional[list[str]] = None,
    ai_key: str = "",
    ai_model: str = "",
) -> list[dict]:
    """Crawl all domains from the registry (or a given list)."""
    if domains is None:
        domains = load_registry()

    results = []
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
        for domain in domains:
            result = await fetch_context(domain, client, ai_key, ai_model)
            if result:
                results.append(result)

    return results
