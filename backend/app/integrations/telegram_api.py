"""Telegram Bot HTTP API helpers (https://core.telegram.org/bots/api)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

import httpx

TELEGRAM_API = "https://api.telegram.org"


def _bot_method_url(token: str, method: str) -> str:
    """Build /bot<token>/<method> with token safely embedded (avoids path quirks)."""
    enc = quote(token, safe="")
    return f"{TELEGRAM_API}/bot{enc}/{method}"


def normalize_bot_token(token: str) -> str:
    """Strip whitespace and an erroneous leading 'bot' (URL already adds /bot<token>/)."""
    t = token.strip()
    if t.lower().startswith("bot") and ":" in t:
        t = t[3:].lstrip()
    return t


def parse_chat_id(raw: str) -> int | str:
    """Telegram accepts int or string; normalize numeric strings to int."""
    s = raw.strip()
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    return s


async def get_me(token: str) -> dict[str, Any]:
    """Validate token; raises ValueError with a clear message on failure."""
    url = _bot_method_url(token, "getMe")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = _parse_response(resp)
    if not data.get("ok"):
        raise _token_error(resp.status_code, data)
    return data["result"]


async def send_message(token: str, chat_id: str | int, text: str) -> None:
    if isinstance(chat_id, int):
        cid: int | str = chat_id
    else:
        cid = parse_chat_id(str(chat_id))
    url = _bot_method_url(token, "sendMessage")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            json={"chat_id": cid, "text": text},
        )
    data = _parse_response(resp)
    if not data.get("ok"):
        raise _send_error(resp.status_code, data)


def _parse_response(resp: httpx.Response) -> dict[str, Any]:
    try:
        return resp.json()
    except Exception:
        return {"ok": False, "description": resp.text[:500] or f"HTTP {resp.status_code}"}


def _token_error(status_code: int, data: dict[str, Any]) -> ValueError:
    desc = data.get("description", "")
    err_code = data.get("error_code")
    if status_code == 404 or err_code == 404:
        return ValueError(
            "Telegram rejected the bot token (HTTP 404). "
            "Use the exact token from @BotFather (format like 123456789:AAH...). "
            "Do not add a 'bot' prefix before the number—that is only part of the API URL."
        )
    if status_code == 401 or err_code == 401:
        return ValueError(
            "Telegram rejected the bot token (unauthorized). Regenerate the token in @BotFather if needed."
        )
    return ValueError(
        f"Telegram token check failed: {desc or status_code} (error_code={err_code})"
    )


def _send_error(status_code: int, data: dict[str, Any]) -> ValueError:
    desc = data.get("description", "sendMessage failed")
    err_code = data.get("error_code")
    if err_code == 404 or status_code == 404:
        return _token_error(status_code, data)
    return ValueError(f"Telegram: {desc} (error_code={err_code})")
