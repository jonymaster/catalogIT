from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _fernet() -> Fernet | None:
    key = get_settings().INTEGRATION_SECRET_KEY.strip()
    if not key:
        return None
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_json(data: dict[str, Any]) -> str:
    """Encrypt a JSON-serializable dict. Raises ValueError if encryption key is not configured."""
    f = _fernet()
    if f is None:
        raise ValueError("INTEGRATION_SECRET_KEY is not configured")
    payload = json.dumps(data, separators=(",", ":")).encode()
    return f.encrypt(payload).decode()


def decrypt_json(ciphertext: str | None) -> dict[str, Any]:
    """Decrypt Fernet payload to dict. Returns {} if empty or no key (legacy rows)."""
    if not ciphertext:
        return {}
    f = _fernet()
    if f is None:
        return {}
    try:
        raw = f.decrypt(ciphertext.encode())
        return json.loads(raw.decode())
    except (InvalidToken, json.JSONDecodeError):
        return {}
