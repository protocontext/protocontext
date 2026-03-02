"""
ProtoContext memories — per-caller persistent memory for voice agents.

Stores call summaries per caller_id (phone number or any unique ID) in two layers:
  - caller_profiles: persistent facts extracted by LLM (name, preferences, etc.)
  - caller_history:  rolling window of last HISTORY_CAP raw call summaries

Designed for ElevenLabs + n8n workflows where n8n sends a summary after each call.
The engine/api.py background task calls update_profile() after extracting facts via LLM.

Database: /app/data/memories.db  (separate from keys.db — no coupling with auth system)
"""

import logging
import os
import sqlite3
from datetime import datetime, timezone

logger = logging.getLogger("protocontext.memories")

_DB_DIR = os.environ.get("PROTO_DATA_DIR", "/app/data")
_DB_PATH = os.path.join(_DB_DIR, "memories.db")

HISTORY_CAP = 10  # max call entries kept per caller_id


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_CREATE_PROFILES = """
CREATE TABLE IF NOT EXISTS caller_profiles (
    caller_id  TEXT PRIMARY KEY,
    profile    TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
"""

_CREATE_HISTORY = """
CREATE TABLE IF NOT EXISTS caller_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_id  TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

_CREATE_HISTORY_INDEX = """
CREATE INDEX IF NOT EXISTS idx_caller_history
    ON caller_history (caller_id, created_at DESC);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_conn() -> sqlite3.Connection:
    os.makedirs(_DB_DIR, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Create memories tables if they don't exist."""
    with _get_conn() as conn:
        conn.execute(_CREATE_PROFILES)
        conn.execute(_CREATE_HISTORY)
        conn.execute(_CREATE_HISTORY_INDEX)
    logger.info("Memories database initialised (%s)", _DB_PATH)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def append(caller_id: str, content: str) -> int:
    """
    Insert a new call summary for caller_id.

    Enforces HISTORY_CAP: oldest entries beyond the cap are deleted automatically.
    Returns the new entry id.
    """
    now = _now_iso()
    with _get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO caller_history (caller_id, content, created_at) VALUES (?, ?, ?)",
            (caller_id, content, now),
        )
        new_id = cur.lastrowid
        # Enforce cap: keep only the most recent HISTORY_CAP entries
        conn.execute(
            """
            DELETE FROM caller_history
            WHERE caller_id = ? AND id NOT IN (
                SELECT id FROM caller_history
                WHERE caller_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            )
            """,
            (caller_id, caller_id, HISTORY_CAP),
        )
    logger.debug("Appended memory for %s (id=%s)", caller_id, new_id)
    return new_id


def get(caller_id: str) -> dict:
    """
    Return all memories for caller_id.

    Returns:
        {
          caller_id: str,
          profile: str,               # LLM-extracted persistent facts
          profile_updated_at: str,    # ISO timestamp or ""
          history: [                  # chronological, oldest first
            { content: str, created_at: str },
            ...
          ]
        }
    """
    with _get_conn() as conn:
        profile_row = conn.execute(
            "SELECT profile, updated_at FROM caller_profiles WHERE caller_id = ?",
            (caller_id,),
        ).fetchone()
        history_rows = conn.execute(
            "SELECT content, created_at FROM caller_history "
            "WHERE caller_id = ? ORDER BY created_at ASC",
            (caller_id,),
        ).fetchall()

    profile = profile_row["profile"] if profile_row else ""
    updated_at = profile_row["updated_at"] if profile_row else ""
    history = [
        {"content": r["content"], "created_at": r["created_at"]}
        for r in history_rows
    ]
    return {
        "caller_id": caller_id,
        "profile": profile,
        "profile_updated_at": updated_at,
        "history": history,
    }


def update_profile(caller_id: str, profile_text: str) -> None:
    """Upsert the persistent profile for a caller."""
    now = _now_iso()
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO caller_profiles (caller_id, profile, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(caller_id) DO UPDATE SET
                profile    = excluded.profile,
                updated_at = excluded.updated_at
            """,
            (caller_id, profile_text, now),
        )
    logger.debug("Profile updated for %s", caller_id)


def delete(caller_id: str) -> bool:
    """
    Delete all history and profile for caller_id.
    Returns True if anything was deleted.
    """
    with _get_conn() as conn:
        cur1 = conn.execute(
            "DELETE FROM caller_history WHERE caller_id = ?", (caller_id,)
        )
        cur2 = conn.execute(
            "DELETE FROM caller_profiles WHERE caller_id = ?", (caller_id,)
        )
    deleted = bool(cur1.rowcount or cur2.rowcount)
    if deleted:
        logger.info("Deleted memories for %s", caller_id)
    return deleted


def get_recent_history(caller_id: str, limit: int = 5) -> list[dict]:
    """
    Return the most recent `limit` history entries in chronological order.
    Used by the background LLM task to build extraction context.
    """
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT content, created_at FROM caller_history "
            "WHERE caller_id = ? ORDER BY created_at DESC LIMIT ?",
            (caller_id, limit),
        ).fetchall()
    return [
        {"content": r["content"], "created_at": r["created_at"]}
        for r in reversed(rows)  # return chronological
    ]


def list_callers() -> list[dict]:
    """
    Return all caller_ids with summary stats, ordered by most recently updated.

    Each entry: { caller_id, profile_snippet, profile_updated_at, call_count }
    """
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                p.caller_id,
                p.profile,
                p.updated_at AS profile_updated_at,
                COUNT(h.id) AS call_count
            FROM caller_profiles p
            LEFT JOIN caller_history h ON h.caller_id = p.caller_id
            GROUP BY p.caller_id
            ORDER BY p.updated_at DESC
            """,
        ).fetchall()

    callers = []
    for r in rows:
        profile = r["profile"] or ""
        # First line of profile as a short snippet
        snippet = profile.split("\n")[0][:80] if profile else ""
        callers.append({
            "caller_id": r["caller_id"],
            "profile_snippet": snippet,
            "profile_updated_at": r["profile_updated_at"],
            "call_count": r["call_count"],
        })

    # Include callers that have history but no profile yet
    with _get_conn() as conn:
        orphan_rows = conn.execute(
            """
            SELECT caller_id, COUNT(*) AS call_count, MAX(created_at) AS last_call
            FROM caller_history
            WHERE caller_id NOT IN (SELECT caller_id FROM caller_profiles)
            GROUP BY caller_id
            ORDER BY last_call DESC
            """,
        ).fetchall()

    for r in orphan_rows:
        callers.append({
            "caller_id": r["caller_id"],
            "profile_snippet": "",
            "profile_updated_at": r["last_call"],
            "call_count": r["call_count"],
        })

    return callers
