"""
ProtoContext parser — parses context.txt format into document chunks.

Only handles the ProtoContext native format.
For llms.txt/llms-full.txt, see converter.py (uses Gemini Flash to convert first).

Supports PCE (ProtoContextExtension) for structured product, room, tour,
action, and policy blocks within sections. Industry metadata
(@industry, @property_type, @location, @store_type, @currency) is extracted
and propagated to all indexed documents.

Each section becomes a standalone document ready for indexing.
"""

import re
import hashlib
from typing import Optional


DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# PCE: Patterns that identify structured content types within sections
_PCE_CONTENT_PATTERNS: dict[str, re.Pattern] = {
    "product": re.compile(r"^PRODUCT_ID:", re.MULTILINE),
    "room": re.compile(r"^ROOM_TYPE:", re.MULTILINE),
    "tour": re.compile(r"^TOUR_ID:", re.MULTILINE),
    "action": re.compile(r"^ACTION:", re.MULTILINE),
    "policy": re.compile(r"^POLICY_TYPE:", re.MULTILINE),
}

# PCE: Industry metadata keys (extracted from @industry, etc.)
PCE_INDUSTRY_KEYS = {"industry", "property_type", "location", "store_type", "currency"}


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")[:80]


def is_context_format(content: str) -> bool:
    """Check if content looks like ProtoContext context.txt format."""
    if not content or not content.strip():
        return False

    lines = content.strip().split("\n")
    first_lines = [l for l in lines[:20] if l.strip()]

    if not first_lines:
        return False

    has_header = first_lines[0].startswith("# ")
    has_sections = any(l.startswith("## section:") for l in lines)

    return has_header and has_sections


def is_llms_format(content: str) -> bool:
    """Check if content looks like llms.txt / llms-full.txt format."""
    if not content or not content.strip():
        return False

    # Reject HTML
    if re.search(r"<\s*(html|head|body|div|script)\b", content[:500], re.IGNORECASE):
        return False
    if content.strip().startswith("<!DOCTYPE") or content.strip().startswith("<html"):
        return False

    lines = content.strip().split("\n")
    first_lines = [l for l in lines[:20] if l.strip()]

    if not first_lines:
        return False

    has_header = first_lines[0].startswith("# ")
    has_md_sections = any(l.startswith("## ") for l in lines)
    has_md_links = any(re.match(r"^-\s*\[.+\]\(.+\)", l.strip()) for l in lines)

    # Has header + (sections or links) but NOT context.txt sections
    has_context_sections = any(l.startswith("## section:") for l in lines)
    if has_context_sections:
        return False

    return has_header and (has_md_sections or has_md_links)


def parse(content: str, domain: str) -> Optional[dict]:
    """
    Parse ProtoContext context.txt content into structured data.

    Returns dict with keys: name, description, metadata, sections, documents, source_format
    Returns None if the content is not valid context.txt format.
    """
    if not content or not content.strip():
        return None

    # Reject HTML
    if re.search(r"<\s*(html|head|body|div|script)\b", content[:500], re.IGNORECASE):
        return None
    if content.strip().startswith("<!DOCTYPE") or content.strip().startswith("<html"):
        return None

    if not is_context_format(content):
        return None

    return _parse_context(content, domain)


def _parse_context(content: str, domain: str) -> Optional[dict]:
    """Parse ProtoContext native format."""
    lines = content.strip().split("\n")
    idx = 0

    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1

    if idx >= len(lines) or not lines[idx].startswith("# "):
        return None

    name = lines[idx][2:].strip()
    idx += 1

    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1

    description = ""
    if idx < len(lines) and lines[idx].startswith("> "):
        description = lines[idx][2:].strip()
        idx += 1

    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1

    metadata = {}
    while idx < len(lines) and lines[idx].startswith("@"):
        match = re.match(r"^@(\w+):\s*(.+)$", lines[idx])
        if match:
            metadata[match.group(1)] = match.group(2).strip()
        idx += 1

    topics = []
    if "topics" in metadata:
        topics = [t.strip() for t in metadata["topics"].split(",") if t.strip()]

    url = metadata.get("canonical", f"https://{domain}/context.txt")
    lang = metadata.get("lang", "en")
    updated = metadata.get("updated", "")

    # PCE: Extract industry metadata
    industry = metadata.get("industry", "")
    location = metadata.get("location", "")

    sections = []
    current_section = None

    while idx < len(lines):
        line = lines[idx]
        if line.startswith("## section:"):
            title = line[len("## section:"):].strip()
            current_section = {"title": title, "body_lines": []}
            sections.append(current_section)
        elif current_section is not None:
            current_section["body_lines"].append(line)
        idx += 1

    if not sections:
        return None

    documents = _build_documents(sections, domain, url, updated, lang, topics, industry, location)

    return {
        "name": name,
        "description": description,
        "metadata": metadata,
        "sections": len(sections),
        "documents": documents,
        "source_format": "context",
    }


def _detect_content_type(body: str) -> str:
    """
    PCE: Detect the content type of a section body.

    Returns one of: "product", "room", "tour", "action", "policy", "info".
    """
    for content_type, pattern in _PCE_CONTENT_PATTERNS.items():
        if pattern.search(body):
            return content_type
    return "website"


def _extract_structured_fields(body: str) -> dict:
    """
    PCE: Extract key-value structured fields from a section body.

    Recognizes lines like:
        PRODUCT_ID: prod-001
        PRICE: $29.99
        BOOKING_URL: https://example.com/book
        ACTION: product_purchase

    Returns a dict of extracted fields (keys lowercased).
    """
    fields = {}
    # Match lines like "KEY: value" or "KEY: value" (with possible indentation)
    kv_pattern = re.compile(r"^\s*([A-Z][A-Z0-9_]+):\s*(.+)$", re.MULTILINE)
    for match in kv_pattern.finditer(body):
        key = match.group(1).lower()
        value = match.group(2).strip()
        fields[key] = value
    return fields


def _build_documents(
    sections: list,
    domain: str,
    url: str,
    updated: str,
    lang: str,
    topics: list,
    industry: str = "",
    location: str = "",
) -> list[dict]:
    """Build document chunks from parsed sections."""
    documents = []
    safe_domain = re.sub(r"[^a-zA-Z0-9_-]", "_", domain)

    for section in sections:
        body = "\n".join(section["body_lines"]).strip()
        if not body or len(body) < 10:
            continue

        # PCE: Detect content type and extract structured fields
        content_type = _detect_content_type(body)
        structured = _extract_structured_fields(body) if content_type != "website" else {}

        # PCE: If section is generic ("website") but site has @industry, use industry as content_type
        if content_type == "website" and industry:
            content_type = industry

        # If a section is very long, split it into sub-chunks
        chunks = _split_long_section(section["title"], body)

        for i, (chunk_title, chunk_body) in enumerate(chunks):
            section_id = slugify(chunk_title)

            # Unique ID: domain + section + hash
            hash_suffix = hashlib.md5(f"{url}_{chunk_title}_{i}".encode()).hexdigest()[:6]
            doc_id = f"{safe_domain}__{section_id}_{hash_suffix}"

            doc = {
                "id": doc_id,
                "domain": domain,
                "section_id": section_id,
                "title": chunk_title,
                "body": chunk_body,
                "url": url,
                "updated": updated,
                "lang": lang,
                "topics": topics,
                "content_type": content_type,
            }

            if location:
                doc["location"] = location

            # PCE: Store action URLs for easy access
            if structured:
                for url_key in ("booking_url", "purchase_url", "details_url", "menu_url"):
                    if url_key in structured:
                        doc["action_url"] = structured[url_key]
                        break

            documents.append(doc)

    return documents


def _split_long_section(title: str, body: str, max_chars: int = 1000) -> list[tuple[str, str]]:
    """
    Split a section body that exceeds max_chars into smaller chunks.
    """
    if len(body) <= max_chars:
        return [(title, body)]

    chunks = []
    paragraphs = re.split(r"\n{2,}", body)

    current_chunk = []
    current_len = 0
    chunk_idx = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if current_len + len(para) > max_chars and current_chunk:
            chunk_body = "\n\n".join(current_chunk)
            chunk_title = title if chunk_idx == 0 else f"{title} (continued)"
            chunks.append((chunk_title, chunk_body))
            current_chunk = []
            current_len = 0
            chunk_idx += 1

        current_chunk.append(para)
        current_len += len(para)

    if current_chunk:
        chunk_body = "\n\n".join(current_chunk)
        chunk_title = title if chunk_idx == 0 else f"{title} (continued)"
        chunks.append((chunk_title, chunk_body))

    return chunks if chunks else [(title, body)]
