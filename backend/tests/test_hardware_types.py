"""Category rules and partial-update regression coverage for generic hardware."""
import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.models.hardware import HardwareAsset
from app.routers.hardware_assets import create_hardware, update_hardware, list_hardware_assets
from app.routers.history import _history_filters
from app.schemas.hardware import HardwareAssetCreate, HardwareAssetUpdate


class HardwareTypeValidationTest(unittest.TestCase):
    def test_category_os_combinations(self):
        for kind, os in [('laptop', 'macos'), ('phone', 'ios'), ('phone', 'android'), ('tablet', 'ipados'), ('tablet', 'android')]:
            with self.subTest(kind=kind, os=os):
                row = HardwareAssetCreate(hardware_type=kind, model_name='Device', serial_number='SN', operating_system=os)
                self.assertEqual(row.operating_system, os)
        for kind, os in [('phone', 'macos'), ('laptop', 'ios'), ('accessory', 'windows')]:
            with self.subTest(kind=kind, os=os), self.assertRaises(ValidationError):
                HardwareAssetCreate(hardware_type=kind, model_name='Device', serial_number='SN', operating_system=os)

    def test_simple_assets_allow_missing_serials(self):
        for kind in ('accessory', 'peripheral'):
            row = HardwareAssetCreate(hardware_type=kind, model_name='  Adapter  ', serial_number='  ')
            self.assertIsNone(row.serial_number)
            self.assertEqual(row.model_name, 'Adapter')

    def test_accessory_quantity_and_single_device_rules(self):
        self.assertEqual(HardwareAssetCreate(hardware_type='accessory', model_name='Cables', quantity=20).quantity, 20)
        for quantity in (0, -1, 1.5, True, 2147483648):
            with self.subTest(quantity=quantity), self.assertRaises(ValidationError):
                HardwareAssetCreate(hardware_type='accessory', model_name='Cables', quantity=quantity)
        with self.assertRaises(ValidationError):
            HardwareAssetCreate(hardware_type='peripheral', model_name='Monitor', quantity=2)

    def test_cellular_identifiers_optional_but_validated(self):
        row = HardwareAssetCreate(hardware_type='tablet', model_name='Wi-Fi iPad', serial_number='IPAD', operating_system='ipados')
        self.assertIsNone(row.imei)
        row = HardwareAssetCreate(hardware_type='phone', model_name='iPhone', serial_number='IPHONE', imei=' 123456789012345 ', imei2='543210987654321')
        self.assertEqual(row.imei, '123456789012345')
        for imei in ('123', '12345678901234x', '１２３４５６７８９０１２３４５'):
            with self.subTest(imei=imei), self.assertRaises(ValidationError):
                HardwareAssetCreate(hardware_type='phone', model_name='Phone', serial_number='SN', imei=imei)
        with self.assertRaises(ValidationError):
            HardwareAssetCreate(model_name='Laptop', serial_number='SN', imei='123456789012345')

    def test_simple_assets_reject_hidden_device_fields(self):
        for values in ({'cpu': 'M3'}, {'mdm_connected': True}, {'os_version': '18'}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                HardwareAssetCreate(hardware_type='accessory', model_name='Cable', **values)

    def test_historical_timeline_reads_both_entity_names(self):
        sql = str(_history_filters('hardware_assets', uuid.uuid4()).compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
        for value in ('hardware_assets', 'laptops', 'hardware', 'laptop'):
            self.assertIn(value, sql)


class HardwareTypeRouterTest(unittest.IsolatedAsyncioTestCase):
    def make_db(self, **fields):
        values = HardwareAssetCreate(model_name='Device', serial_number='SN', **fields).model_dump()
        row = SimpleNamespace(id=uuid.uuid4(), is_active=True, **values)
        db = MagicMock()
        db.get = AsyncMock(return_value=row)
        db.scalar = AsyncMock(return_value=None)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        return row, db

    async def test_partial_update_checks_existing_category(self):
        row, db = self.make_db(hardware_type='phone', operating_system='ios')
        for patch in ({'serial_number': None}, {'quantity': 3}, {'operating_system': 'macos'}, {'hardware_type': 'peripheral'}):
            with self.subTest(patch=patch), self.assertRaises(HTTPException) as ctx:
                await update_hardware(row.id, HardwareAssetUpdate(**patch), db=db)
            self.assertEqual(ctx.exception.status_code, 422)
            json.dumps(ctx.exception.detail)  # UUIDs from merged records must not leak into JSON errors.
        db.flush.assert_not_awaited()
        self.assertEqual(row.hardware_type, 'phone')

    async def test_accessory_quantity_can_be_updated_and_serial_cleared(self):
        row, db = self.make_db(hardware_type='accessory')
        result = await update_hardware(row.id, HardwareAssetUpdate(quantity=20, serial_number=None), db=db)
        self.assertEqual(result.quantity, 20)
        self.assertIsNone(result.serial_number)

    async def test_peripheral_location_is_resolved(self):
        location_id = uuid.uuid4()
        location = SimpleNamespace(id=location_id, name='Meeting room')
        db = MagicMock()
        db.get = AsyncMock(return_value=location)
        db.scalar = AsyncMock(return_value=None)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        result = await create_hardware(HardwareAssetCreate(hardware_type='peripheral', model_name='Monitor', hardware_location_id=location_id), db=db)
        self.assertEqual(result.hardware_location_id, location_id)
        self.assertIsNone(result.serial_number)
        self.assertIsInstance(result, HardwareAsset)

    async def test_archived_batch_cannot_change_quantity(self):
        row, db = self.make_db(hardware_type='accessory')
        row.is_active = False
        with self.assertRaises(HTTPException) as ctx:
            await update_hardware(row.id, HardwareAssetUpdate(quantity=10), db=db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_list_filters_category(self):
        db = MagicMock()
        db.execute = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        await list_hardware_assets(archived=False, hardware_type='peripheral', db=db)
        statement = db.execute.call_args.args[0]
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
        self.assertIn("hardware_assets.hardware_type = 'peripheral'", sql)


class HardwareTransactionTimingTest(unittest.IsolatedAsyncioTestCase):
    async def test_transaction_finishes_before_response_is_sent(self):
        import httpx
        from fastapi import FastAPI
        from app.dependencies.auth import get_current_user
        from app.dependencies.db import get_audited_db
        from app.database import get_db
        from app.routers.hardware_assets import router

        events = []
        db = MagicMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=result)

        async def session():
            yield db
            events.append("commit")

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="admin")
        app.dependency_overrides[get_audited_db] = session
        app.dependency_overrides[get_db] = lambda: db

        async def observed_app(scope, receive, send):
            async def observed_send(message):
                if message["type"] == "http.response.start":
                    events.append("response")
                await send(message)
            await app(scope, receive, observed_send)

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=observed_app), base_url="http://test") as client:
            response = await client.get("/api/hardware/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(events, ["commit", "response"])
