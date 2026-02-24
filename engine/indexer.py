"""
ProtoContext indexer — sends parsed documents to Typesense.

Uses a singleton client to avoid creating a new connection per request.
Includes auto-embedding via ts/all-MiniLM-L12-v2 for future semantic search.
"""

import os
import logging
from urllib.parse import urlparse

import typesense
from typesense.exceptions import TypesenseClientError

logger = logging.getLogger("protocontext.indexer")

TYPESENSE_URL = os.environ.get("TYPESENSE_URL", "http://localhost:8108")
TYPESENSE_API_KEY = os.environ.get("TYPESENSE_API_KEY", "protocontext-dev-key")
COLLECTION_NAME = "contexts"
MAX_CHUNKS_PER_DOMAIN = 500

# Parse URL into node config
_parsed = urlparse(TYPESENSE_URL)

# Singleton client
_client: typesense.Client | None = None


def get_client() -> typesense.Client:
    """Return the singleton Typesense client (created once)."""
    global _client
    if _client is None:
        _client = typesense.Client({
            "api_key": TYPESENSE_API_KEY,
            "nodes": [{
                "host": _parsed.hostname or "localhost",
                "port": str(_parsed.port or 8108),
                "protocol": _parsed.scheme or "http",
            }],
            "connection_timeout_seconds": 5,
        })
    return _client


def setup_index(client: typesense.Client | None = None):
    """
    Create and configure the Typesense collection.
    Call once on startup.
    """
    if client is None:
        client = get_client()

    schema = {
        "name": COLLECTION_NAME,
        "fields": [
            {"name": "domain",       "type": "string", "facet": True},
            {"name": "section_id",   "type": "string", "facet": True},
            {"name": "title",        "type": "string"},
            {"name": "body",         "type": "string"},
            {"name": "url",          "type": "string", "optional": True},
            {"name": "updated",      "type": "string", "sort": True, "optional": True},
            {"name": "lang",         "type": "string", "facet": True, "optional": True},
            {"name": "topics",       "type": "string[]", "facet": True, "optional": True},
            # PCE: Structured content fields
            {"name": "content_type", "type": "string", "facet": True, "optional": True},
            {"name": "location",     "type": "string", "facet": True, "optional": True},
            {"name": "action_url",   "type": "string", "optional": True},
            {
                "name": "embedding",
                "type": "float[]",
                "embed": {
                    "from": ["title", "body"],
                    "model_config": {"model_name": "ts/all-MiniLM-L12-v2"},
                },
            },
        ],
    }

    try:
        client.collections.create(schema)
        logger.info(f"Created collection '{COLLECTION_NAME}'")
    except TypesenseClientError as e:
        if "already exists" in str(e).lower():
            logger.info(f"Collection '{COLLECTION_NAME}' already exists")
        else:
            raise

    logger.info("Collection configured")


def index_documents(documents: list[dict], client: typesense.Client | None = None):
    """
    Add or update documents in the collection.

    Enforces MAX_CHUNKS_PER_DOMAIN limit per domain.
    """
    if not documents:
        return

    if client is None:
        client = get_client()

    # Group by domain and enforce limit
    by_domain: dict[str, list[dict]] = {}
    for doc in documents:
        domain = doc["domain"]
        if domain not in by_domain:
            by_domain[domain] = []
        by_domain[domain].append(doc)

    all_docs = []
    for domain, docs in by_domain.items():
        if len(docs) > MAX_CHUNKS_PER_DOMAIN:
            logger.warning(
                f"{domain}: {len(docs)} chunks exceeds limit of {MAX_CHUNKS_PER_DOMAIN}, truncating"
            )
            docs = docs[:MAX_CHUNKS_PER_DOMAIN]
        all_docs.extend(docs)

    # Ensure topics is always a list (Typesense is strict about string[])
    for doc in all_docs:
        topics = doc.get("topics")
        if topics is None:
            doc["topics"] = []
        elif isinstance(topics, str):
            doc["topics"] = [t.strip() for t in topics.split(",") if t.strip()]

        # PCE: Default content_type to "website" if missing
        if "content_type" not in doc:
            doc["content_type"] = "website"

    result = client.collections[COLLECTION_NAME].documents.import_(
        all_docs, {"action": "upsert"}
    )

    # Count successes
    success_count = sum(1 for r in result if r.get("success", False))
    logger.info(f"Indexed {success_count}/{len(all_docs)} documents")
    return result


def delete_domain(domain: str, client: typesense.Client | None = None):
    """Remove all documents for a given domain."""
    if client is None:
        client = get_client()

    result = client.collections[COLLECTION_NAME].documents.delete(
        {"filter_by": f"domain:={domain}"}
    )
    deleted = result.get("num_deleted", 0)
    logger.info(f"Deleted {deleted} documents for {domain}")
    return result


def search(
    query: str = "",
    domain: str | None = None,
    section: str | None = None,
    lang: str | None = None,
    content_type: str | None = None,
    limit: int = 10,
    client: typesense.Client | None = None,
) -> dict:
    """
    Search the collection.

    Supports filtering by domain, section, lang, and content_type.
    Returns normalized response with hits as flat documents.
    """
    if client is None:
        client = get_client()

    params = {
        "q": query if query else "*",
        "query_by": "body,title,domain,topics",
        "per_page": limit,
    }

    # Build filter
    filters = []
    if domain:
        filters.append(f"domain:={domain}")
    if section:
        filters.append(f"section_id:={section}")
    if lang:
        filters.append(f"lang:={lang}")
    if content_type:
        filters.append(f"content_type:={content_type}")

    if filters:
        params["filter_by"] = " && ".join(filters)

    result = client.collections[COLLECTION_NAME].documents.search(params)

    # Normalize: extract documents from Typesense hit wrappers
    hits = [hit["document"] for hit in result.get("hits", [])]

    return {
        "hits": hits,
        "found": result.get("found", 0),
        "search_time_ms": result.get("search_time_ms", 0),
    }


def get_stats(client: typesense.Client | None = None) -> dict:
    """Get collection statistics."""
    try:
        if client is None:
            client = get_client()
        collection = client.collections[COLLECTION_NAME].retrieve()
        return {
            "total_documents": collection.get("num_documents", 0),
            "is_indexing": False,
        }
    except Exception:
        return {"total_documents": 0, "is_indexing": False}
