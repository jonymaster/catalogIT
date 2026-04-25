from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.routers.laptops import search_laptops


class _FakeExecuteResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def scalars(self) -> "_FakeExecuteResult":
        return self

    def all(self) -> list[object]:
        return self._rows


class _FakeDb:
    def __init__(self, rows: list[object] | None = None) -> None:
        self.rows = rows or []
        self.statements: list[object] = []

    async def execute(self, stmt: object) -> _FakeExecuteResult:
        self.statements.append(stmt)
        return _FakeExecuteResult(self.rows)


class LaptopSearchTest(unittest.IsolatedAsyncioTestCase):
    async def test_blank_query_returns_no_rows_without_database_query(self) -> None:
        db = _FakeDb()

        result = await search_laptops(q="   ", _hw=SimpleNamespace(), db=db)

        self.assertEqual(result, [])
        self.assertEqual(db.statements, [])

    async def test_search_query_matches_serial_number(self) -> None:
        laptop = SimpleNamespace(serial_number="C02FABRIC01")
        db = _FakeDb(rows=[laptop])

        result = await search_laptops(
            q="C02FABRIC01",
            limit=20,
            _hw=SimpleNamespace(),
            db=db,
        )

        self.assertEqual(result, [laptop])
        self.assertEqual(len(db.statements), 1)
        compiled = str(
            db.statements[0].compile(compile_kwargs={"literal_binds": True})
        ).lower()
        self.assertIn("laptops.serial_number", compiled)
        self.assertIn("%c02fabric01%", compiled)


if __name__ == "__main__":
    unittest.main()
