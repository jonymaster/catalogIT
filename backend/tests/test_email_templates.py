import unittest

from app.notifications.email_templates import (
    _apply_logo_block,
    load_default_renewal_html,
)


class EmailTemplateDefaultsTest(unittest.TestCase):
    def test_default_html_loads(self) -> None:
        html = load_default_renewal_html()
        self.assertIn("{{service_name}}", html)
        self.assertIn("{{logo_block}}", html)

    def test_logo_block_replaced_when_logo_asset(self) -> None:
        h = "<div>{{logo_block}}</div>"
        out = _apply_logo_block(h, {"logo": "k"})
        self.assertIn('src="cid:logo"', out)
        self.assertNotIn("{{logo_block}}", out)

    def test_logo_block_empty_without_asset(self) -> None:
        h = "<div>{{logo_block}}</div>"
        out = _apply_logo_block(h, None)
        self.assertEqual(out, "<div></div>")
