from __future__ import annotations

import re
from typing import Any

from app.schemas.integration import EmailTemplatePreviewResponse

# Mustache-style {{variable_name}} — no external deps (avoids missing chevron in container images).
_MUSTACHE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def render_mustache(template: str, data: dict[str, Any]) -> str:
    """Replace {{key}} with values from data; unknown keys become empty string."""

    def _sub(m: re.Match[str]) -> str:
        key = m.group(1)
        val = data.get(key)
        return "" if val is None else str(val)

    return _MUSTACHE.sub(_sub, template)


def render_templates(meta: dict[str, Any], data: dict[str, Any]) -> tuple[str, str, str]:
    subject_t = meta.get("email_subject_template") or "{{title}}"
    html_t = meta.get("email_html_template") or "<p>{{body}}</p>"
    text_t = meta.get("email_text_template") or "{{body}}"
    subj = render_mustache(subject_t, data)
    html = render_mustache(html_t, data)
    text = render_mustache(text_t, data)
    return subj, html, text


def _strip_tags(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html)
    return re.sub(r"\s+", " ", text).strip()


def render_preview(meta: dict[str, Any], sample_data: dict[str, Any]) -> EmailTemplatePreviewResponse:
    subj, html, text = render_templates(meta, sample_data)
    if not text.strip():
        text = _strip_tags(html)
    return EmailTemplatePreviewResponse(subject=subj, html=html, text=text)
