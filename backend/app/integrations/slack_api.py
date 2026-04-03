from __future__ import annotations

from typing import Any

import httpx


async def resolve_channel_id(token: str, label: str) -> str:
    """Resolve #name, name, or channel ID to a Slack channel ID."""
    s = label.strip()
    if s.startswith("C") and len(s) >= 9:
        return s
    name = s.lstrip("#").strip().lower()
    if not name:
        raise ValueError("Channel label is empty")

    cursor: str | None = None
    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            params: dict[str, Any] = {"types": "public_channel,private_channel", "limit": 200}
            if cursor:
                params["cursor"] = cursor
            resp = await client.get(
                "https://slack.com/api/conversations.list",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            data = resp.json()
            if not data.get("ok"):
                raise ValueError(data.get("error", "conversations.list failed"))
            for ch in data.get("channels", []):
                if ch.get("name", "").lower() == name:
                    return ch["id"]
            cursor = data.get("response_metadata", {}).get("next_cursor") or None
            if not cursor:
                break

    raise ValueError(
        f'Channel "{label}" not found. Invite the bot to the channel or check the name.'
    )


async def post_message(token: str, channel: str, text: str) -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://slack.com/api/chat.postMessage",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=utf-8",
            },
            json={"channel": channel, "text": text},
        )
    data = resp.json()
    if not data.get("ok"):
        err = data.get("error", "unknown")
        raise ValueError(f"Slack chat.postMessage failed: {err}")
