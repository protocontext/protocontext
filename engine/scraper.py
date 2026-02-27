"""
ProtoContext scraper — extracts structured Markdown content from websites.

This is the LAST fallback in the crawl chain (after context.txt, llms-full.txt, llms.txt).
Requires an ai_key to convert scraped content to context.txt format.

Flow:
  1. Fetch sitemap.xml → extract ALL page URLs
  2. If no sitemap → crawl internal links from homepage (BFS, 2 levels)
  3. If no links → scrape homepage only
  4. Scrape each page → extract clean Markdown via trafilatura (preserving structure)
  5. Each page becomes its own section (no collapsing)
  6. Send to LLM for context.txt conversion (handled by converter.py)

Content extraction stack:
  - Primary: trafilatura (F1=0.909, best boilerplate removal, native Markdown)
  - Fallback: readability-lxml (boilerplate removal) + markdownify (conversion)
"""

import re
import asyncio
import logging
from typing import Optional
from urllib.parse import urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup

logger = logging.getLogger("protocontext.scraper")

# Limit concurrent browser instances to avoid OOM in Docker (~300MB each)
_BROWSER_SEMAPHORE = asyncio.Semaphore(2)

USER_AGENT = "ProtoContext-Crawler/1.0"
SITEMAP_TIMEOUT = 10.0
PAGE_TIMEOUT = 8.0
MAX_PAGES = 50
MAX_PAGE_HTML_SIZE = 5_000_000  # 5MB max HTML per page (modern SPAs are large)
MAX_TEXT_PER_PAGE = 15000       # chars of extracted Markdown per page (richer than plain text)

# Common sitemap paths to try
SITEMAP_PATHS = [
    "/sitemap.xml",
    "/sitemap_index.xml",
]

# URL patterns to skip (not content pages)
SKIP_URL_PATTERNS = [
    r"/wp-content/",
    r"/wp-includes/",
    r"/wp-admin/",
    r"/admin/",
    r"/login/",
    r"/cart/",
    r"/checkout/",
    r"/assets/",
    r"/static/",
    r"/feed/",
    r"/rss/",
    r"/tag/",
    r"/author/",
    r"/sitemap",
    r"\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf|zip|mp4|mp3|woff|ttf)(\?|$)",
]


async def scrape_site_content(
    domain: str,
    client: httpx.AsyncClient,
    max_pages: int = MAX_PAGES,
) -> Optional[str]:
    """
    Scrape content from a website via its sitemap.xml.

    Returns combined page content ready for Gemini conversion, or None on failure.
    """
    # Extract root domain for sitemap/homepage lookup
    root_domain = domain.split("/")[0]

    # Step 1: Get ALL page URLs from sitemap (no limit yet)
    urls = await fetch_sitemap_urls(root_domain, client, max_pages=500)

    if not urls:
        # No sitemap found — crawl internal links from homepage
        logger.info(f"{domain}: no sitemap, crawling internal links from homepage")
        urls = await _crawl_internal_links(root_domain, client, max_pages)
        if not urls:
            # Last resort: just the homepage
            homepage = await scrape_page_content(f"https://{root_domain}/", client)
            if homepage and len(homepage) > 200:
                return f"# Scraped content from: {domain}\n\n## Page: Homepage (/)\n\n{homepage}"
            return None
        logger.info(f"{domain}: discovered {len(urls)} pages via internal link crawl")

    # Step 2: Filter to a single language to avoid scraping translations
    urls = _filter_best_language_urls(urls, max_pages)
    logger.info(f"{domain}: selected {len(urls)} URLs after language filtering")

    # Step 3: Scrape pages concurrently (batches of 10 to avoid overwhelming the server)
    selected_urls = urls[:max_pages]
    sections = [f"# Scraped content from: {domain}\n"]
    pages_scraped = 0

    BATCH_SIZE = 10
    for i in range(0, len(selected_urls), BATCH_SIZE):
        batch = selected_urls[i : i + BATCH_SIZE]
        results = await asyncio.gather(
            *(scrape_page_content(url, client) for url in batch),
            return_exceptions=True,
        )

        for url, content in zip(batch, results):
            if isinstance(content, Exception) or not content or len(content) <= 100:
                continue
            path = urlparse(url).path or "/"
            page_title = _path_to_title(path)
            sections.append(f"\n## Page: {page_title} ({path})\n\n{content}")
            pages_scraped += 1

        logger.info(f"{domain}: scraped batch {i // BATCH_SIZE + 1}, {pages_scraped} pages so far")

    if pages_scraped == 0:
        logger.info(f"{domain}: no content extracted from sitemap pages")
        return None

    combined = "\n".join(sections)
    logger.info(f"{domain}: scraped {pages_scraped} pages, {len(combined)} chars total")

    return combined


# Language path prefixes commonly used in multilingual sites
_LANG_PREFIXES = ["/it/", "/en/", "/de/", "/fr/", "/es/", "/pt/", "/ru/", "/nl/", "/ja/", "/zh/", "/ko/"]


def _filter_best_language_urls(urls: list[str], max_pages: int) -> list[str]:
    """
    Filter URLs to a single language version to avoid wasting scrape slots on translations.
    Picks the language with the most pages. Also includes root/no-language URLs.
    """
    # Group URLs by language prefix
    lang_groups: dict[str, list[str]] = {"none": []}

    for url in urls:
        path = urlparse(url).path.lower()
        found_lang = False
        for prefix in _LANG_PREFIXES:
            if prefix in path:
                lang = prefix.strip("/")
                lang_groups.setdefault(lang, []).append(url)
                found_lang = True
                break
        if not found_lang:
            lang_groups["none"].append(url)

    # If no language grouping detected, return original list
    non_none_groups = {k: v for k, v in lang_groups.items() if k != "none"}
    if not non_none_groups:
        return urls[:max_pages]

    # Pick the language with the most URLs (primary language)
    best_lang = max(non_none_groups, key=lambda k: len(non_none_groups[k]))
    logger.info(f"Selected primary language: /{best_lang}/ ({len(non_none_groups[best_lang])} pages)")

    # Combine: root URLs + best language URLs
    selected = lang_groups["none"] + non_none_groups[best_lang]
    return selected[:max_pages]


async def fetch_sitemap_urls(
    domain: str,
    client: httpx.AsyncClient,
    max_pages: int = MAX_PAGES,
) -> list[str]:
    """
    Fetch sitemap.xml and extract page URLs.
    Handles both regular sitemaps and sitemap indexes (nested sitemaps).
    Uses the root domain for sitemap lookups even if domain includes a path.
    """
    # Extract root domain (strip any path like /it, /en, etc.)
    root_domain = domain.split("/")[0]

    for path in SITEMAP_PATHS:
        url = f"https://{root_domain}{path}"
        try:
            resp = await client.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=SITEMAP_TIMEOUT,
            )

            if resp.status_code != 200:
                continue

            xml_content = resp.text

            # Quick sanity check — should look like XML
            if not xml_content.strip().startswith("<?xml") and "<urlset" not in xml_content[:500]:
                continue

            urls = await _parse_sitemap_xml(xml_content, root_domain, client, max_pages)

            if urls:
                logger.info(f"{domain}: found {len(urls)} URLs in {path}")
                return urls[:max_pages]

        except (httpx.TimeoutException, httpx.RequestError):
            continue

    # Try robots.txt for sitemap location
    sitemap_url = await _find_sitemap_in_robots(root_domain, client)
    if sitemap_url:
        try:
            resp = await client.get(
                sitemap_url,
                headers={"User-Agent": USER_AGENT},
                timeout=SITEMAP_TIMEOUT,
            )
            if resp.status_code == 200:
                urls = await _parse_sitemap_xml(resp.text, root_domain, client, max_pages)
                if urls:
                    return urls[:max_pages]
        except (httpx.TimeoutException, httpx.RequestError):
            pass

    logger.info(f"{domain}: no sitemap found")
    return []


async def _parse_sitemap_xml(
    xml_content: str,
    domain: str,
    client: httpx.AsyncClient,
    max_pages: int = MAX_PAGES,
) -> list[str]:
    """Parse sitemap XML and extract page URLs. Follows sub-sitemaps recursively."""
    try:
        soup = await asyncio.to_thread(BeautifulSoup, xml_content, "lxml-xml")

        # Check if this is a sitemap index (contains <sitemap> tags)
        sitemap_tags = soup.find_all("sitemap")
        if sitemap_tags:
            sub_sitemap_urls = []
            for st in sitemap_tags:
                loc = st.find("loc")
                if loc:
                    sub_sitemap_urls.append(loc.get_text().strip())

            if not sub_sitemap_urls:
                return []

            logger.info(f"{domain}: found sitemapindex with {len(sub_sitemap_urls)} sub-sitemaps")
            preferred_order = _sort_sitemaps_by_language(sub_sitemap_urls)

            all_urls = []
            sitemaps_followed = 0
            for sub_url in preferred_order:
                if sitemaps_followed >= 3 or len(all_urls) >= max_pages:
                    break
                try:
                    resp = await client.get(
                        sub_url,
                        headers={"User-Agent": USER_AGENT},
                        timeout=SITEMAP_TIMEOUT,
                    )
                    if resp.status_code != 200:
                        continue

                    sub_xml = resp.text
                    sub_soup = await asyncio.to_thread(BeautifulSoup, sub_xml, "lxml-xml")

                    # Handle nested sitemapindex (recursive)
                    nested_sitemaps = sub_soup.find_all("sitemap")
                    if nested_sitemaps:
                        logger.info(f"{domain}: sub-sitemap {sub_url} is itself an index, following...")
                        nested_urls = await _parse_sitemap_xml(sub_xml, domain, client, max_pages - len(all_urls))
                        all_urls.extend(nested_urls)
                    else:
                        # Regular sitemap — extract page URLs
                        for loc in sub_soup.find_all("loc"):
                            url = loc.get_text().strip()
                            if _is_content_url(url):
                                all_urls.append(url)

                    sitemaps_followed += 1
                    logger.info(f"{domain}: followed sub-sitemap {sub_url} ({len(all_urls)} URLs so far)")
                except (httpx.TimeoutException, httpx.RequestError):
                    continue

            if all_urls:
                return all_urls[:max_pages]

            # Fallback: if following sub-sitemaps yielded nothing, log it
            logger.warning(f"{domain}: followed {sitemaps_followed} sub-sitemaps but got 0 page URLs")
            return []

        # Regular sitemap — extract all <loc> tags
        urls = []
        for loc in soup.find_all("loc"):
            url = loc.get_text().strip()
            if _is_content_url(url):
                urls.append(url)

        return urls[:max_pages]

    except Exception as e:
        logger.warning(f"{domain}: failed to parse sitemap XML: {e}")
        return []


def _sort_sitemaps_by_language(urls: list[str]) -> list[str]:
    """
    Sort sub-sitemap URLs preferring English first, then other languages.
    Handles patterns like sitemap_en.xml, sitemap_it-IT.xml, etc.
    """
    en_sitemaps = []
    other_sitemaps = []
    for url in urls:
        lower = url.lower()
        if "_en." in lower or "_en-" in lower or "/en." in lower:
            en_sitemaps.append(url)
        else:
            other_sitemaps.append(url)
    return en_sitemaps + other_sitemaps


async def _find_sitemap_in_robots(
    domain: str,
    client: httpx.AsyncClient,
) -> Optional[str]:
    """Check robots.txt for a Sitemap: directive."""
    try:
        resp = await client.get(
            f"https://{domain}/robots.txt",
            headers={"User-Agent": USER_AGENT},
            timeout=5.0,
        )
        if resp.status_code != 200:
            return None

        for line in resp.text.split("\n"):
            if line.strip().lower().startswith("sitemap:"):
                sitemap_url = line.split(":", 1)[1].strip()
                if sitemap_url.startswith("http"):
                    return sitemap_url

    except (httpx.TimeoutException, httpx.RequestError):
        pass

    return None


async def _crawl_internal_links(
    domain: str,
    client: httpx.AsyncClient,
    max_pages: int = MAX_PAGES,
) -> list[str]:
    """
    Discover pages by crawling internal links starting from the homepage.
    Does a breadth-first crawl up to 2 levels deep.
    Returns a list of unique internal URLs found.
    """
    base_url = f"https://{domain}"
    seen: set[str] = set()
    to_visit: list[str] = [f"{base_url}/"]
    discovered: list[str] = []

    for depth in range(2):  # 2 levels of crawling
        if not to_visit or len(discovered) >= max_pages:
            break

        next_level: list[str] = []

        # Crawl current level in batches
        BATCH = 10
        for i in range(0, len(to_visit), BATCH):
            if len(discovered) >= max_pages:
                break
            batch = to_visit[i : i + BATCH]
            results = await asyncio.gather(
                *(_fetch_page_links(url, domain, client) for url in batch),
                return_exceptions=True,
            )

            for url, result in zip(batch, results):
                if url not in seen:
                    seen.add(url)
                    if _is_content_url(url):
                        discovered.append(url)

                if isinstance(result, Exception) or not result:
                    continue

                for link in result:
                    if link not in seen and len(discovered) + len(next_level) < max_pages * 3:
                        next_level.append(link)

        to_visit = next_level
        logger.info(f"{domain}: depth {depth + 1} crawl found {len(discovered)} pages, {len(next_level)} links to follow")

    return discovered[:max_pages]


async def _fetch_page_links(
    url: str,
    domain: str,
    client: httpx.AsyncClient,
) -> list[str]:
    """Fetch a page and extract internal links."""
    try:
        resp = await client.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=PAGE_TIMEOUT,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            return []

        content_type = resp.headers.get("content-type", "")
        if "text/html" not in content_type:
            return []

        # Don't parse huge pages just for links
        if len(resp.content) > 2_000_000:
            return []

        soup = BeautifulSoup(resp.text, "lxml")
        links: list[str] = []
        base = f"https://{domain}"

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"].strip()

            # Skip anchors, javascript, mailto, tel
            if href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue

            # Resolve relative URLs
            if href.startswith("/"):
                href = f"{base}{href}"
            elif not href.startswith("http"):
                continue

            # Only keep same-domain links
            parsed = urlparse(href)
            link_domain = parsed.netloc.lower().lstrip("www.")
            our_domain = domain.lower().lstrip("www.")
            if link_domain != our_domain:
                continue

            # Normalize: remove query params and fragments for dedup
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")
            if clean_url and _is_content_url(clean_url):
                links.append(clean_url)

        # Deduplicate while preserving order
        seen_links: set[str] = set()
        unique: list[str] = []
        for link in links:
            if link not in seen_links:
                seen_links.add(link)
                unique.append(link)

        return unique

    except (httpx.TimeoutException, httpx.RequestError):
        return []


def _is_content_url(url: str) -> bool:
    """Filter out URLs that are unlikely to be content pages."""
    for pattern in SKIP_URL_PATTERNS:
        if re.search(pattern, url, re.IGNORECASE):
            return False
    return True


def _is_blocked(resp: httpx.Response) -> bool:
    """Detect WAF/bot-challenge responses that httpx cannot resolve."""
    s, h = resp.status_code, resp.headers
    # AWS WAF challenge (returns 202 + action header)
    if s == 202 and h.get("x-amzn-waf-action") == "challenge":
        return True
    # Cloudflare block / JS challenge
    if s in (403, 503) and ("cf-ray" in h or "cf-mitigated" in h):
        return True
    return False


async def _scrape_with_browser(url: str) -> Optional[str]:
    """
    Playwright headless fallback for sites that block httpx (AWS WAF, Cloudflare, JS SPAs).
    Requires `playwright install chromium` at build time.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright not installed — cannot scrape JS-heavy/WAF-protected site")
        return None

    async with _BROWSER_SEMAPHORE:
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-blink-features=AutomationControlled",
                    ],
                )
                ctx = await browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    locale="en-US",
                    viewport={"width": 1280, "height": 800},
                )
                page = await ctx.new_page()
                await page.goto(url, wait_until="networkidle", timeout=30_000)
                html = await page.content()
                await browser.close()

            result = await asyncio.to_thread(_extract_text_from_html, html)
            if result:
                logger.info(f"Browser scraping OK: {url} ({len(result)} chars)")
            return result

        except Exception as e:
            logger.warning(f"Browser scraping failed for {url}: {e}")
            return None


async def scrape_page_content(
    url: str,
    client: httpx.AsyncClient,
) -> Optional[str]:
    """
    Scrape and extract clean text content from a single HTML page.
    Returns plain text or None on failure.
    """
    try:
        resp = await client.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=PAGE_TIMEOUT,
            follow_redirects=True,
        )

        # WAF/bot challenge → httpx can't resolve, fall back to browser
        if _is_blocked(resp):
            logger.info(f"WAF/bot block ({resp.status_code}), trying browser: {url}")
            return await _scrape_with_browser(url)

        if resp.status_code != 200:
            return None

        content_type = resp.headers.get("content-type", "")
        if "text/html" not in content_type:
            return None

        # Reject oversized pages
        if len(resp.content) > MAX_PAGE_HTML_SIZE:
            logger.warning(f"Page too large ({len(resp.content)} bytes), skipping: {url}")
            return None

        html = resp.text
        # Run CPU-heavy HTML parsing in thread pool to avoid blocking the event loop
        result = await asyncio.to_thread(_extract_text_from_html, html)

        # JS-rendered SPA: server returned substantial HTML but trafilatura extracted nothing
        if result is None and len(resp.content) > 10_000:
            logger.info(f"JS SPA detected ({len(resp.content)}b HTML, no text), trying browser: {url}")
            return await _scrape_with_browser(url)

        return result

    except (httpx.TimeoutException, httpx.RequestError):
        return None


def _extract_text_from_html(html: str) -> Optional[str]:
    """
    Extract structured Markdown content from HTML.

    Uses a two-tier approach:
      1. trafilatura — best boilerplate removal (F1=0.909), native Markdown output,
         preserves headings, lists, tables, bold/italic.
      2. Fallback: readability-lxml (content extraction) + html-to-markdown (conversion)
         for pages where trafilatura is too aggressive.

    Returns Markdown string or None.
    """
    # --- Tier 1: trafilatura (primary) ---
    try:
        result = trafilatura.extract(
            html,
            output_format="markdown",
            include_tables=True,
            include_links=True,
            include_images=False,
            include_formatting=True,
            include_comments=False,
            favor_recall=True,      # keep more content, don't over-strip
            favor_precision=False,
        )
        if result and len(result) > 150:
            if len(result) > MAX_TEXT_PER_PAGE:
                result = result[:MAX_TEXT_PER_PAGE]
            return result
    except Exception as e:
        logger.debug(f"trafilatura extraction failed: {e}")

    # --- Tier 2: readability + markdownify (fallback) ---
    try:
        from readability import Document
        from markdownify import markdownify as md_convert

        doc = Document(html)
        clean_html = doc.summary()
        if clean_html:
            md = md_convert(clean_html, heading_style="ATX", strip=["img"])
            if md and len(md) > 150:
                if len(md) > MAX_TEXT_PER_PAGE:
                    md = md[:MAX_TEXT_PER_PAGE]
                return md
    except ImportError:
        logger.debug("readability/markdownify not available for fallback")
    except Exception as e:
        logger.debug(f"readability fallback failed: {e}")

    # --- Tier 3: BeautifulSoup plain text (last resort) ---
    try:
        soup = BeautifulSoup(html, "lxml")
        for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
            tag.decompose()

        body = soup.find("body")
        if not body:
            return None

        text = body.get_text(separator="\n", strip=True)
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        text = "\n".join(lines)

        if len(text) > MAX_TEXT_PER_PAGE:
            text = text[:MAX_TEXT_PER_PAGE]

        return text if len(text) > 150 else None

    except Exception as e:
        logger.warning(f"All extraction methods failed: {e}")
        return None


def _path_to_title(path: str) -> str:
    """Convert a URL path to a readable page title."""
    path = path.strip("/")

    if not path:
        return "Homepage"

    # Take the last segment of the path
    segment = path.split("/")[-1]

    # Remove file extensions
    segment = re.sub(r"\.\w+$", "", segment)

    # Replace dashes, underscores with spaces
    title = segment.replace("-", " ").replace("_", " ")

    # Title case
    return title.title() if title else "Page"
