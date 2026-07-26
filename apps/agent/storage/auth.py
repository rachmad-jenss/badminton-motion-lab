"""Small, dependency-free helpers for local agent credentials."""

from __future__ import annotations

import hashlib
import secrets
import time


def new_secret() -> str:
    return secrets.token_urlsafe(32)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def now_epoch() -> int:
    return int(time.time())
