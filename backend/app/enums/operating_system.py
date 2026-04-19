"""Allowed laptop operating_system values (stored as lowercase strings in DB)."""

from __future__ import annotations

from enum import StrEnum


class OperatingSystem(StrEnum):
    MACOS = "macos"
    LINUX = "linux"
    WINDOWS = "windows"
