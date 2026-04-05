import unittest
import uuid

from app.audit_redaction import redact_mapping, redact_serialized_row


class AuditRedactionTest(unittest.TestCase):
    def test_redacts_password_hash(self) -> None:
        row = {"email": "a@b.com", "password_hash": "secret"}
        out = redact_serialized_row(row)
        self.assertEqual(out["email"], "a@b.com")
        self.assertEqual(out["password_hash"], "[REDACTED]")

    def test_redacts_nested_secret_key(self) -> None:
        d = {"outer": {"client_secret": "x"}}
        out = redact_mapping(d)
        assert out is not None
        self.assertEqual(out["outer"]["client_secret"], "[REDACTED]")

    def test_preserves_non_secret(self) -> None:
        uid = str(uuid.uuid4())
        out = redact_serialized_row({"id": uid, "name": "x"})
        self.assertEqual(out["id"], uid)
