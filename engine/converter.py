"""
ProtoContext converter — uses AI models to convert llms.txt/llms-full.txt
and scraped website content to ProtoContext context.txt format.

Supports multiple AI providers:
  - Gemini (Google) — default
  - OpenAI (GPT models)
  - OpenRouter (access to hundreds of models)

The AI key and model are passed per-request by the caller — never stored server-side.
Model format: "provider/model-name" (e.g., "gemini/gemini-3-flash-preview", "openai/gpt-4o-mini")
"""

import re
import logging
from typing import Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("protocontext.converter")

DEFAULT_MODEL = "gemini/gemini-3-flash-preview"

CONVERSION_PROMPT = """You are a format converter. Convert the following website content into ProtoContext context.txt format.

RULES — follow exactly:
1. Start with: # Site Name
2. Then: > One-line description (max 160 chars)
3. Then metadata:
   @lang: {lang_code}
   @version: 1.0
   @updated: {today}
   @canonical: https://{domain}/context.txt
   @topics: comma, separated, relevant, topics
4. Then sections, each starting with: ## section: Section Title
   Followed by plain text content (no markdown, no HTML, no links).

IMPORTANT:
- Extract the REAL content — what the site does, its features, how to use it, pricing, etc.
- Each section should be 3-10 lines of dense, useful text.
- PRESERVE all specific names: product names, service names, restaurant names, people names, places, brands.
- If the source mentions specific sub-services, features, or entities (e.g. individual restaurants, specific products, named services), create a SEPARATE section for each one.
- No bullet points — use plain sentences.
- No URLs in the body text.
- No code blocks.
- Maximum 30 sections.
- If the content is documentation, summarize the key topics into logical sections.
- Keep it factual and concise — this is for AI agents to understand the site.

OUTPUT ONLY the context.txt content. No explanations, no markdown fences, no commentary.
Start directly with # and end after the last section.

---

DOMAIN: {domain}
SOURCE CONTENT:

{content}"""

PCE_CONVERSION_PROMPT = """You are a format converter. Convert the following website content into ProtoContext context.txt format with PCE (ProtoContextExtension) structured blocks.

This site is a hospitality, ecommerce, or tourism business. Use the PCE extension for structured product/service data.

RULES — follow exactly:
1. Start with: # Site Name
2. Then: > One-line description (max 160 chars)
3. Then metadata:
   @lang: {lang_code}
   @version: 1.0
   @updated: {today}
   @canonical: https://{domain}/context.txt
   @topics: comma, separated, relevant, topics
   @industry: hospitality OR ecommerce OR tours
   @location: City, Country (if identifiable)
4. Then sections. For products/rooms/tours, use PCE structured blocks:

FOR PRODUCTS (ecommerce):
## section: Product Name
PRODUCT_ID: unique-id
PRICE: $XX.XX
CATEGORY: category name
PURCHASE_URL: https://...
Description of the product in plain text sentences.

FOR ROOMS (hospitality):
## section: Room Name
ROOM_TYPE: standard OR suite OR deluxe OR villa
CAPACITY: X guests
RATE: from $XXX/night
BOOKING_URL: https://...
Description of the room in plain text sentences.

FOR TOURS/EXPERIENCES:
## section: Tour Name
TOUR_ID: unique-id
DURATION: X hours/days
PRICE: from $XX
BOOKING_URL: https://...
Description of the tour in plain text sentences.

FOR ACTIONS (bookable/purchasable):
## section: Action Name
ACTION: book_room OR purchase_product OR book_tour
INPUTS: required fields (e.g. dates, guests, quantity)
OUTPUTS: confirmation, receipt, etc.
Description of how to perform this action.

FOR POLICIES:
## section: Policy Name
POLICY_TYPE: returns OR cancellation OR check-in OR refund
RULE: key policy rule in one sentence
Full policy details in plain text.

5. Also include regular ## section: blocks for general info (about, contact, location, etc.)

IMPORTANT:
- Use structured blocks ONLY for products, rooms, tours, actions, and policies.
- Regular info sections should NOT have structured fields.
- No bullet points — use plain sentences.
- No markdown links in body text.
- Maximum 30 sections.
- Keep it factual and concise — this is for AI agents to understand the site.

OUTPUT ONLY the context.txt content. No explanations, no markdown fences, no commentary.
Start directly with # and end after the last section.

---

DOMAIN: {domain}
SOURCE CONTENT:

{content}"""

SCRAPE_CONVERSION_PROMPT = """You are a format converter. Convert scraped website pages into ProtoContext context.txt format.

The input contains multiple scraped pages from a website. Each page is marked with "## Page: Title (path)".

RULES — follow exactly:
1. Start with: # Site Name
2. Then: > One-line description (max 160 chars)
3. Then metadata:
   @lang: {lang_code}
   @version: 1.0
   @updated: {today}
   @canonical: https://{domain}/context.txt
   @topics: comma, separated, relevant, topics
4. Then ONE section per scraped page, starting with: ## section: Page Title
   Followed by the key content of THAT specific page.

CRITICAL RULES:
- Create ONE section for EACH scraped page. Do NOT merge pages together.
- Preserve specific names, proper nouns, product names, service names, prices, and details.
- Each section should contain 3-10 lines of dense, factual content from that page.
- No bullet points — use plain sentences.
- No URLs in the body text.
- No code blocks, no HTML, no markdown.
- If a page has very little content (less than 2 sentences), you may skip it.
- Keep it factual — this is for AI agents to understand the site.

EXAMPLE of what a section should look like:
## section: La Ghiotta Restaurant
La Ghiotta is an Italian restaurant located in Hotel Hermitage, specializing in traditional Tuscan cuisine. The restaurant offers a seasonal menu featuring handmade pasta, grilled meats, and local seafood. Open for dinner from 19:00 to 22:00. The dining room seats 60 guests with a terrace overlooking the garden.

OUTPUT ONLY the context.txt content. No explanations, no markdown fences, no commentary.
Start directly with # and end after the last section.

---

DOMAIN: {domain}
SCRAPED PAGES:

{content}"""


# ---------------------------------------------------------------------------
# Multi-provider LLM dispatcher
# ---------------------------------------------------------------------------

def _parse_model(ai_model: str) -> tuple[str, str]:
    """
    Parse 'provider/model-name' into (provider, model_name).
    For OpenRouter models like 'openrouter/google/gemini-3-flash-preview',
    the provider is 'openrouter' and model_name is 'google/gemini-3-flash-preview'.
    """
    if not ai_model:
        ai_model = DEFAULT_MODEL

    parts = ai_model.split("/", 1)
    if len(parts) != 2:
        # No slash — assume it's a Gemini model name
        return ("gemini", ai_model)

    provider = parts[0].lower()
    model_name = parts[1]

    return (provider, model_name)


async def _call_llm(prompt: str, ai_key: str, ai_model: str) -> Optional[str]:
    """
    Call an LLM with the given prompt. Dispatches to the correct provider API.

    Supports: gemini, openai, openrouter.
    Returns the generated text or None on failure.
    """
    provider, model_name = _parse_model(ai_model)

    if provider == "gemini":
        return await _call_gemini(prompt, ai_key, model_name)
    elif provider == "openai":
        return await _call_openai(prompt, ai_key, model_name)
    elif provider == "openrouter":
        return await _call_openrouter(prompt, ai_key, model_name)
    else:
        logger.error(f"Unknown AI provider: '{provider}'. Use gemini/, openai/, or openrouter/")
        return None


async def _call_gemini(prompt: str, api_key: str, model: str) -> Optional[str]:
    """Call Google Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
            "topP": 0.95,
        },
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code == 400:
                logger.error(f"Gemini API bad request: {resp.text[:200]}")
                return None
            if resp.status_code == 403:
                logger.error("Gemini API key is invalid or expired")
                return None
            if resp.status_code != 200:
                logger.error(f"Gemini API error {resp.status_code}: {resp.text[:200]}")
                return None

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                logger.error("Gemini returned no candidates")
                return None

            return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")

    except httpx.TimeoutException:
        logger.error("Gemini request timed out")
        return None
    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        return None


async def _call_openai(prompt: str, api_key: str, model: str) -> Optional[str]:
    """Call OpenAI API (chat completions)."""
    url = "https://api.openai.com/v1/chat/completions"

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 8192,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code == 401:
                logger.error("OpenAI API key is invalid or expired")
                return None
            if resp.status_code != 200:
                logger.error(f"OpenAI API error {resp.status_code}: {resp.text[:200]}")
                return None

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                logger.error("OpenAI returned no choices")
                return None

            return choices[0].get("message", {}).get("content", "")

    except httpx.TimeoutException:
        logger.error("OpenAI request timed out")
        return None
    except Exception as e:
        logger.error(f"OpenAI call failed: {e}")
        return None


async def _call_openrouter(prompt: str, api_key: str, model: str) -> Optional[str]:
    """Call OpenRouter API (OpenAI-compatible)."""
    url = "https://openrouter.ai/api/v1/chat/completions"

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 8192,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code == 401:
                logger.error("OpenRouter API key is invalid or expired")
                return None
            if resp.status_code != 200:
                logger.error(f"OpenRouter API error {resp.status_code}: {resp.text[:200]}")
                return None

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                logger.error("OpenRouter returned no choices")
                return None

            return choices[0].get("message", {}).get("content", "")

    except httpx.TimeoutException:
        logger.error("OpenRouter request timed out")
        return None
    except Exception as e:
        logger.error(f"OpenRouter call failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Clean LLM output (shared by all providers)
# ---------------------------------------------------------------------------

def _clean_llm_output(text: str, domain: str) -> Optional[str]:
    """Validate and clean LLM output to ensure it's valid context.txt."""
    if not text or not text.strip().startswith("#"):
        logger.error(f"{domain}: LLM returned invalid context.txt (starts with: {text[:50] if text else 'empty'})")
        return None

    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
        text = text.strip()

    return text


# ---------------------------------------------------------------------------
# Public conversion functions
# ---------------------------------------------------------------------------

def detect_industry(content: str) -> str:
    """
    Detect if content belongs to a hospitality/ecommerce/tourism industry.
    Returns: "hospitality", "ecommerce", "tours", or "" (not detected).
    """
    sample = content[:5000].lower()

    hospitality_signals = [
        "hotel", "resort", "check-in", "check-out", "room type", "suite",
        "booking", "guest", "accommodation", "spa", "concierge", "amenities",
        "bed and breakfast", "hostel", "villa", "lodge",
    ]
    ecommerce_signals = [
        "add to cart", "shopping cart", "checkout", "product", "price",
        "buy now", "shop", "store", "shipping", "returns policy", "refund",
        "order", "inventory", "sku", "catalog",
    ]
    tour_signals = [
        "tour", "excursion", "itinerary", "experience", "adventure",
        "guided", "sightseeing", "day trip", "cruise", "safari",
        "activity", "attractions",
    ]

    scores = {
        "hospitality": sum(1 for w in hospitality_signals if w in sample),
        "ecommerce": sum(1 for w in ecommerce_signals if w in sample),
        "tours": sum(1 for w in tour_signals if w in sample),
    }

    best = max(scores, key=scores.get)  # type: ignore
    if scores[best] >= 3:
        return best
    return ""


async def convert_to_pce(
    raw_content: str,
    domain: str,
    today: str,
    ai_key: str,
    lang: str = "en",
    ai_model: str = "",
) -> Optional[str]:
    """
    Convert content to PCE (ProtoContextExtension) context.txt format.
    Used when the content is detected as hospitality/ecommerce/tours.
    """
    if not ai_key:
        logger.error("No AI key provided — cannot convert to PCE")
        return None

    if not raw_content or len(raw_content.strip()) < 50:
        return None

    content_for_prompt = raw_content[:100_000]

    prompt = PCE_CONVERSION_PROMPT.format(
        domain=domain,
        today=today,
        lang_code=lang,
        content=content_for_prompt,
    )

    ai_model = ai_model or DEFAULT_MODEL
    text = await _call_llm(prompt, ai_key, ai_model)
    text = _clean_llm_output(text, domain) if text else None

    if text:
        provider, model_name = _parse_model(ai_model)
        logger.info(f"{domain}: converted to PCE format via {provider}/{model_name} ({len(text)} chars)")

    return text


async def convert_to_context(
    raw_content: str,
    domain: str,
    today: str,
    ai_key: str,
    lang: str = "en",
    ai_model: str = "",
) -> Optional[str]:
    """
    Convert raw llms.txt/llms-full.txt content to context.txt format via AI.

    Args:
        raw_content: The raw llms.txt content
        domain: The domain name
        today: Today's date string (YYYY-MM-DD)
        ai_key: API key for the AI provider
        lang: Language code
        ai_model: Model in provider/model format (default: gemini/gemini-3-flash-preview)
    """
    if not ai_key:
        logger.error("No AI key provided — cannot convert content")
        return None

    if not raw_content or len(raw_content.strip()) < 50:
        return None

    content_for_prompt = raw_content[:100_000]

    prompt = CONVERSION_PROMPT.format(
        domain=domain,
        today=today,
        lang_code=lang,
        content=content_for_prompt,
    )

    ai_model = ai_model or DEFAULT_MODEL
    text = await _call_llm(prompt, ai_key, ai_model)
    text = _clean_llm_output(text, domain) if text else None

    if text:
        provider, model_name = _parse_model(ai_model)
        logger.info(f"{domain}: converted content via {provider}/{model_name} ({len(text)} chars)")

    return text


async def convert_scraped_to_context(
    raw_content: str,
    domain: str,
    today: str,
    ai_key: str,
    lang: str = "en",
    ai_model: str = "",
) -> Optional[str]:
    """
    Convert scraped website content to context.txt format.
    Auto-detects hospitality/ecommerce/tours content and uses PCE format when appropriate.
    Uses a specialized prompt that preserves per-page detail instead of summarizing.
    """
    if not ai_key:
        logger.error("No AI key provided — cannot convert scraped content")
        return None

    if not raw_content or len(raw_content.strip()) < 50:
        return None

    # PCE: Auto-detect industry and use specialized prompt
    industry = detect_industry(raw_content)
    if industry:
        logger.info(f"{domain}: detected industry '{industry}', using PCE conversion")
        return await convert_to_pce(raw_content, domain, today, ai_key, lang, ai_model)

    content_for_prompt = raw_content[:100_000]

    prompt = SCRAPE_CONVERSION_PROMPT.format(
        domain=domain,
        today=today,
        lang_code=lang,
        content=content_for_prompt,
    )

    ai_model = ai_model or DEFAULT_MODEL
    text = await _call_llm(prompt, ai_key, ai_model)
    text = _clean_llm_output(text, domain) if text else None

    if text:
        provider, model_name = _parse_model(ai_model)
        logger.info(f"{domain}: converted scraped content via {provider}/{model_name} ({len(text)} chars)")

    return text


async def fetch_and_convert(
    domain: str,
    raw_content: str,
    source_path: str,
    today: str,
    ai_key: str,
    ai_model: str = "",
) -> Optional[str]:
    """
    High-level: takes raw llms content, follows links if index, converts via AI.

    Args:
        domain: The domain name
        raw_content: Raw llms.txt/llms-full.txt content
        source_path: The path it was fetched from (e.g., /llms.txt)
        today: Today's date string
        ai_key: API key for the AI provider
        ai_model: Model in provider/model format
    """
    if not ai_key:
        logger.warning(f"{domain}: no AI key, skipping conversion")
        return None

    # If it's an llms.txt index (short, mostly links), follow links for richer content
    has_linked_pages = False
    if _is_llms_index(raw_content):
        logger.info(f"{domain}: detected llms.txt index, following links...")
        enriched = await _fetch_llms_linked_content(domain, raw_content)
        if enriched and len(enriched) > len(raw_content):
            raw_content = enriched
            has_linked_pages = True

    # Detect language
    lang = _detect_language(raw_content)

    # Use scrape prompt if we have per-page content from links
    if has_linked_pages:
        return await convert_scraped_to_context(raw_content, domain, today, ai_key, lang, ai_model)

    # Convert via AI (standard prompt)
    return await convert_to_context(raw_content, domain, today, ai_key, lang, ai_model)


def _is_llms_index(content: str) -> bool:
    """Check if content is a short llms.txt index (mostly links, little text)."""
    lines = content.strip().split("\n")
    non_blank = [l for l in lines if l.strip()]

    if len(non_blank) > 50:
        return False

    link_count = sum(1 for l in non_blank if re.match(r"^-\s*\[.+\]\(.+\)", l.strip()))
    text_count = len(non_blank) - link_count

    return link_count >= 2 and link_count >= text_count


async def _fetch_llms_linked_content(domain: str, index_content: str) -> Optional[str]:
    """
    Follow markdown links in an llms.txt index file.
    Fetches linked .md/.txt files and HTML pages, extracting their content for Gemini.
    """
    link_pattern = re.compile(r"-\s*\[([^\]]+)\]\((https?://[^)]+)\)")
    links = link_pattern.findall(index_content)

    if not links:
        return None

    # Deduplicate by URL
    seen_urls = set()
    unique_links = []
    for title, url in links:
        if url not in seen_urls:
            seen_urls.add(url)
            unique_links.append((title, url))

    all_content = [index_content, "\n\n---\n\n"]

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for title, url in unique_links[:25]:
            try:
                resp = await client.get(url, headers={"User-Agent": "ProtoContext-Crawler/1.0"})
                if resp.status_code != 200:
                    continue

                ct = resp.headers.get("content-type", "")

                if "text/html" in ct:
                    # Extract text from HTML pages
                    text = _extract_text_from_html(resp.text)
                    if not text or len(text.strip()) < 100:
                        continue
                else:
                    text = resp.text
                    if not text or len(text.strip()) < 50:
                        continue

                all_content.append(f"\n\n## Page: {title}\n\n")
                all_content.append(text[:5000])

                logger.info(f"{domain}: fetched linked page: {title} ({len(text)} chars)")

            except (httpx.TimeoutException, httpx.RequestError):
                continue

    combined = "".join(all_content)
    return combined if len(combined) > len(index_content) + 100 else None


def _extract_text_from_html(html: str) -> Optional[str]:
    """Extract main content text from HTML, stripping navigation/scripts/footer."""
    try:
        soup = BeautifulSoup(html, "lxml")

        for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
            tag.decompose()

        for selector in ["nav", "footer", "header", '[role="navigation"]', '[role="banner"]',
                         ".navbar", ".nav", ".menu", ".footer", ".sidebar",
                         ".cookie-banner", ".popup", ".modal"]:
            for el in soup.select(selector):
                el.decompose()

        main_content = None
        for selector in ["main", "article", '[role="main"]', "#content", ".content",
                         "#main", ".main", ".entry-content", ".post-content",
                         ".page-content"]:
            found = soup.select_one(selector)
            if found:
                main_content = found
                break

        if not main_content:
            main_content = soup.find("body")

        if not main_content:
            return None

        text = main_content.get_text(separator="\n", strip=True)
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        return "\n".join(lines)

    except Exception:
        return None


def _detect_language(content: str) -> str:
    """Simple language detection."""
    sample = content[:2000].lower()

    lang_signals = {
        "es": ["según", "también", "información", "página", "más"],
        "it": ["anche", "della", "nella", "questo", "sono"],
        "fr": ["également", "cette", "pour", "dans", "avec"],
        "de": ["auch", "diese", "werden", "nicht", "eine"],
        "pt": ["também", "para", "esta", "mais", "como"],
    }

    for lang, words in lang_signals.items():
        matches = sum(1 for w in words if w in sample)
        if matches >= 2:
            return lang

    return "en"
