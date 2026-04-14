"""Curated badge presets for reference data (aligned with UI chip light/dark tokens)."""

from __future__ import annotations

import random

# Keep in sync with frontend `REFERENCE_BADGE_PRESETS` / `REFERENCE_BADGE_PRESET_CLASSES`.
# Order: brightest → darkest (light-mode chip); keep in sync with frontend picker.
BADGE_COLOR_PRESETS: tuple[str, ...] = (
    "white",
    "yellow",
    "lime",
    "cyan",
    "sky",
    "green",
    "emerald",
    "teal",
    "blue",
    "pink",
    "rose",
    "fuchsia",
    "magenta",
    "violet",
    "purple",
    "orange",
    "amber",
    "red",
    "indigo",
    "brand",
    "gray",
    "navy",
    "brown",
    "dark_gray",
)

_VALID = frozenset(BADGE_COLOR_PRESETS)

# Legacy rows that stored #RRGGBB before preset migration.
_LEGACY_HEX_TO_PRESET: dict[str, str] = {
    "#6366f1": "indigo",
    "#8b5cf6": "violet",
    "#ec4899": "pink",
    "#f43f5e": "rose",
    "#f97316": "orange",
    "#eab308": "yellow",
    "#22c55e": "emerald",
    "#14b8a6": "teal",
    "#06b6d4": "cyan",
    "#3b82f6": "blue",
    "#a855f7": "purple",
    "#0ea5e9": "sky",
}

# Old preset ids removed or renamed (migration + API coercion).
_LEGACY_PRESET_ALIASES: dict[str, str] = {
    "slate": "dark_gray",
    "zinc": "gray",
    "neutral": "navy",
    "stone": "brown",
    "beige": "brown",
    "ruby": "magenta",
}


def pick_random_badge_color() -> str:
    return random.choice(BADGE_COLOR_PRESETS)


def normalize_badge_preset(raw: str) -> str:
    s = raw.strip().lower()
    if not s:
        raise ValueError("Badge color must be a non-empty preset id.")
    s = _LEGACY_PRESET_ALIASES.get(s, s)
    if s not in _VALID:
        raise ValueError(
            f"Invalid badge color preset: {raw!r}. "
            f"Use one of: {', '.join(sorted(BADGE_COLOR_PRESETS))}.",
        )
    return s


def legacy_hex_to_preset(raw: str) -> str | None:
    """If ``raw`` looks like a legacy hex color, return the mapped preset; else ``None``."""
    s = raw.strip().lower()
    if len(s) == 6 and all(c in "0123456789abcdef" for c in s):
        s = f"#{s}"
    if s.startswith("#") and len(s) == 7:
        return _LEGACY_HEX_TO_PRESET.get(s)
    return None


def coerce_badge_preset_value(raw: str) -> str:
    """Accept a valid preset id, legacy id, or legacy hex; default ``gray``."""
    s = raw.strip().lower()
    if not s:
        return "gray"
    s = _LEGACY_PRESET_ALIASES.get(s, s)
    if s in _VALID:
        return s
    mapped = legacy_hex_to_preset(raw)
    if mapped is not None:
        return _LEGACY_PRESET_ALIASES.get(mapped, mapped)
    return "gray"
