"""
ProtoContext auth — SQLite-backed API key management + admin account + sessions.

Key format:  proto_ + secrets.token_urlsafe(36)  (~53 chars)
Storage:     SHA-256 hash (plaintext never stored)
DB location: /app/data/keys.db  (Docker volume)
"""

import hashlib
import logging
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("protocontext.auth")

_DB_DIR = os.environ.get("PROTO_DATA_DIR", "/app/data")
_DB_PATH = os.path.join(_DB_DIR, "keys.db")

SESSION_TTL_DAYS = 7

# ---------------------------------------------------------------------------
# Table schemas
# ---------------------------------------------------------------------------

_CREATE_API_KEYS = """
CREATE TABLE IF NOT EXISTS api_keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    key_prefix   TEXT    NOT NULL,
    key_hash     TEXT    NOT NULL UNIQUE,
    name         TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL,
    last_used_at TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1
);
"""

_CREATE_ADMIN = """
CREATE TABLE IF NOT EXISTS admin_account (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    password_salt TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
);
"""

_CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL,
    expires_at TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1
);
"""

_CREATE_SETTINGS = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash_key(raw_key: str) -> str:
    """SHA-256 hex digest of a raw API key or session token."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _hash_password(password: str, salt: str) -> str:
    """PBKDF2-HMAC-SHA256 with 600k iterations (OWASP 2023 recommendation)."""
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        600_000,
    )
    return dk.hex()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_conn() -> sqlite3.Connection:
    os.makedirs(_DB_DIR, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------


def init_db() -> None:
    """Create all tables if they don't exist."""
    with _get_conn() as conn:
        conn.execute(_CREATE_API_KEYS)
        conn.execute(_CREATE_ADMIN)
        conn.execute(_CREATE_SESSIONS)
        conn.execute(_CREATE_SETTINGS)
    logger.info("Auth database initialised (%s)", _DB_PATH)


# ---------------------------------------------------------------------------
# Admin account
# ---------------------------------------------------------------------------


def has_admin() -> bool:
    """Check if an admin account exists."""
    with _get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) AS cnt FROM admin_account").fetchone()
    return row["cnt"] > 0


def create_admin(name: str, email: str, password: str) -> dict:
    """
    Create the admin account.  Raises ValueError if one already exists.
    Returns {name, email, created_at}.
    """
    salt = secrets.token_hex(32)
    pw_hash = _hash_password(password, salt)
    now = _now_iso()

    with _get_conn() as conn:
        try:
            conn.execute(
                "INSERT INTO admin_account (id, name, email, password_hash, password_salt, created_at) "
                "VALUES (1, ?, ?, ?, ?, ?)",
                (name, email, pw_hash, salt, now),
            )
        except sqlite3.IntegrityError:
            raise ValueError("Admin account already exists")

    logger.info("Admin account created for %s", email)
    return {"name": name, "email": email, "created_at": now}


def verify_admin(email: str, password: str) -> bool:
    """Verify admin credentials.  Returns True if valid."""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT password_hash, password_salt FROM admin_account WHERE email = ?",
            (email,),
        ).fetchone()

    if row is None:
        return False

    computed = _hash_password(password, row["password_salt"])
    return secrets.compare_digest(computed, row["password_hash"])


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


def create_session() -> str:
    """Create a new session token.  Returns the raw token (shown once)."""
    raw_token = "proto_" + secrets.token_urlsafe(36)
    token_hash = _hash_key(raw_token)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=SESSION_TTL_DAYS)

    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)",
            (token_hash, now.isoformat(), expires.isoformat()),
        )

    return raw_token


def validate_session(raw_token: str) -> bool:
    """Check if a session token is valid (exists, active, not expired)."""
    token_hash = _hash_key(raw_token)
    now_str = _now_iso()

    with _get_conn() as conn:
        row = conn.execute(
            "SELECT id, is_active, expires_at FROM sessions WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()

        if row is None or not row["is_active"]:
            return False

        if row["expires_at"] < now_str:
            conn.execute("UPDATE sessions SET is_active = 0 WHERE id = ?", (row["id"],))
            return False

    return True


def invalidate_session(raw_token: str) -> bool:
    """Deactivate a session (logout).  Returns True if a row was updated."""
    token_hash = _hash_key(raw_token)
    with _get_conn() as conn:
        cur = conn.execute(
            "UPDATE sessions SET is_active = 0 WHERE token_hash = ? AND is_active = 1",
            (token_hash,),
        )
    return bool(cur.rowcount)


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------


def generate_key(name: str = "") -> dict:
    """
    Generate a new API key.

    Returns a dict with {id, key, key_prefix, name, created_at}.
    The full `key` is shown only at creation time — it is never stored.
    """
    raw_key = "proto_" + secrets.token_urlsafe(36)
    prefix = raw_key[:12]
    key_hash = _hash_key(raw_key)
    now = _now_iso()

    with _get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO api_keys (key_prefix, key_hash, name, created_at) VALUES (?, ?, ?, ?)",
            (prefix, key_hash, name, now),
        )
        key_id = cur.lastrowid

    logger.info("Generated API key id=%s prefix=%s name=%r", key_id, prefix, name)
    return {
        "id": key_id,
        "key": raw_key,
        "key_prefix": prefix,
        "name": name,
        "created_at": now,
    }


def validate_key(raw_key: str) -> bool:
    """
    Check whether a raw API key is valid (exists and active).

    Updates `last_used_at` on success.
    """
    key_hash = _hash_key(raw_key)

    with _get_conn() as conn:
        row = conn.execute(
            "SELECT id, is_active FROM api_keys WHERE key_hash = ?",
            (key_hash,),
        ).fetchone()

        if row is None or not row["is_active"]:
            return False

        conn.execute(
            "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
            (_now_iso(), row["id"]),
        )

    return True


def list_keys() -> list[dict]:
    """Return all API keys (metadata only — never expose hash)."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT id, key_prefix, name, created_at, last_used_at, is_active FROM api_keys ORDER BY id"
        ).fetchall()

    return [
        {
            "id": r["id"],
            "key_prefix": r["key_prefix"],
            "name": r["name"],
            "created_at": r["created_at"],
            "last_used_at": r["last_used_at"],
            "is_active": bool(r["is_active"]),
        }
        for r in rows
    ]


def revoke_key(key_id: int) -> bool:
    """Deactivate a key by its ID.  Returns True if a row was updated."""
    with _get_conn() as conn:
        cur = conn.execute(
            "UPDATE api_keys SET is_active = 0 WHERE id = ? AND is_active = 1",
            (key_id,),
        )

    if cur.rowcount:
        logger.info("Revoked API key id=%s", key_id)
        return True
    return False


# ---------------------------------------------------------------------------
# Settings (key-value store for admin preferences like AI config)
# ---------------------------------------------------------------------------

_ALLOWED_SETTINGS = {"ai_provider", "ai_key", "ai_model"}


def get_settings() -> dict[str, str]:
    """Return all saved settings as a dict."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT key, value FROM settings WHERE key IN (?, ?, ?)",
            tuple(_ALLOWED_SETTINGS),
        ).fetchall()
    return {r["key"]: r["value"] for r in rows}


def save_settings(data: dict[str, str]) -> None:
    """Upsert settings. Only allowed keys are saved; empty values are deleted."""
    with _get_conn() as conn:
        for key, value in data.items():
            if key not in _ALLOWED_SETTINGS:
                continue
            if value:
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )
            else:
                conn.execute("DELETE FROM settings WHERE key = ?", (key,))
