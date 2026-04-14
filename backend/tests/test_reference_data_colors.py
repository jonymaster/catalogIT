import unittest

from pydantic import ValidationError

from app.reference_data_colors import (
    BADGE_COLOR_PRESETS,
    coerce_badge_preset_value,
    legacy_hex_to_preset,
    normalize_badge_preset,
    pick_random_badge_color,
)
from app.schemas.category import CategoryCreate


class ReferenceDataColorsTest(unittest.TestCase):
    def test_normalize_badge_preset(self) -> None:
        self.assertEqual(normalize_badge_preset("  Emerald "), "emerald")

    def test_normalize_legacy_alias(self) -> None:
        self.assertEqual(normalize_badge_preset("slate"), "dark_gray")
        self.assertEqual(normalize_badge_preset("ruby"), "magenta")

    def test_normalize_badge_preset_rejects_unknown(self) -> None:
        with self.assertRaises(ValueError):
            normalize_badge_preset("not-a-preset")

    def test_legacy_hex_to_preset(self) -> None:
        self.assertEqual(legacy_hex_to_preset("#3b82f6"), "blue")
        self.assertIsNone(legacy_hex_to_preset("emerald"))

    def test_coerce_badge_preset_value(self) -> None:
        self.assertEqual(coerce_badge_preset_value("#3b82f6"), "blue")
        self.assertEqual(coerce_badge_preset_value("violet"), "violet")
        self.assertEqual(coerce_badge_preset_value("stone"), "brown")
        self.assertEqual(coerce_badge_preset_value("beige"), "brown")
        self.assertEqual(coerce_badge_preset_value("nope"), "gray")

    def test_pick_random_badge_color_from_palette(self) -> None:
        for _ in range(40):
            c = pick_random_badge_color()
            self.assertIn(c, BADGE_COLOR_PRESETS)

    def test_category_create_optional_color(self) -> None:
        body = CategoryCreate(name="Test")
        self.assertIsNone(body.color)

    def test_category_create_validates_color(self) -> None:
        body = CategoryCreate(name="Test", color="teal")
        self.assertEqual(body.color, "teal")
        body_alias = CategoryCreate(name="Test", color="ruby")
        self.assertEqual(body_alias.color, "magenta")
        with self.assertRaises(ValidationError):
            CategoryCreate(name="Test", color="#aabbcc")
