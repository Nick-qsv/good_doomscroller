"""Stable identifiers and content hashes."""

from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid

_ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/Nick-qsv/good_doomscroller")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def stable_id(prefix: str, *parts: object) -> str:
    material = "\x1f".join(str(part) for part in parts)
    return f"{prefix}_{sha256_text(material)[:20]}"


def stable_uuid(*parts: object) -> str:
    """Return a deterministic UUID suitable for PostgreSQL entity primary keys."""

    material = "\x1f".join(str(part) for part in parts)
    return str(uuid.uuid5(_ID_NAMESPACE, material))


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or "untitled"
