"""Opt-in migration/API check against a disposable PostgreSQL database at revision 047.

Run from backend: DATABASE_URL=.../catalogit_test python -m tests.hardware_integration_check
Never point this check at application data. It intentionally inserts test fixtures.
"""
import asyncio
import os
import subprocess
import uuid
from types import SimpleNamespace

import httpx
from sqlalchemy import text
from sqlalchemy.engine import make_url

assert make_url(os.environ['DATABASE_URL']).database.endswith('_test'), 'Use a disposable *_test database'

from app.database import engine, async_session
from app.dependencies.auth import get_current_user

ASSET_ID = uuid.UUID('10000000-0000-0000-0000-000000000001')
COST_ID = uuid.UUID('20000000-0000-0000-0000-000000000001')
ATTACHMENT_ID = uuid.UUID('30000000-0000-0000-0000-000000000001')


def migrate(target):
    subprocess.run(['alembic', 'upgrade', target], check=True)


async def main():
    async with engine.begin() as conn:
        version = await conn.scalar(text('SELECT version_num FROM alembic_version'))
        assert version == '047', f'Expected fresh revision 047, got {version}'
        await conn.execute(text("INSERT INTO laptops (id, serial_number, model_name, status, operating_system, is_active) VALUES (:id, 'LEGACY-SERIAL', 'Existing laptop', 'In Stock', 'macos', true)"), {'id': ASSET_ID})
        await conn.execute(text("INSERT INTO cost_records (id, laptop_id, fiscal_year, amount, record_type) VALUES (:id, :asset, 2026, 1234.50, 'actual')"), {'id': COST_ID, 'asset': ASSET_ID})
        await conn.execute(text("INSERT INTO attachments (id, entity_type, entity_id, filename, original_filename, content_type, file_size, storage_key) VALUES (:id, 'laptop', :asset, 'contract.pdf', 'contract.pdf', 'application/pdf', 20, 'laptop/legacy-object.pdf')"), {'id': ATTACHMENT_ID, 'asset': ASSET_ID})
        await conn.execute(text("INSERT INTO global_audit_event (id, category, event_type, entity_table, entity_key, details) VALUES (:id, 'data_change', 'INSERT', 'laptops', :asset, '{}')"), {'id': uuid.uuid4(), 'asset': str(ASSET_ID)})
    await engine.dispose()
    migrate('head')
    # Check supported rollback before creating assets that cannot fit the old schema.
    subprocess.run(['alembic', 'downgrade', '047'], check=True)
    migrate('head')

    from app.main import create_app
    from app.models.user import User
    from app.models.hardware_location import HardwareLocation
    async with async_session() as db:
        admin = User(id=uuid.uuid4(), external_id='test-admin', email='test@example.test', first_name='Test', last_name='Admin', role='admin', is_active=True)
        location = HardwareLocation(id=uuid.uuid4(), name='Meeting room')
        db.add_all([admin, location])
        await db.commit()
        actor = SimpleNamespace(id=admin.id, role='admin')
        location_id = str(location.id)

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: actor
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        async def request(method, path, expected=200, **kwargs):
            response = await client.request(method, path, **kwargs)
            assert response.status_code == expected, (method, path, response.status_code, response.text)
            return response.json() if response.content else None

        legacy = await request('GET', f'/api/hardware/{ASSET_ID}')
        assert legacy['id'] == str(ASSET_ID) and legacy['hardware_type'] == 'laptop' and legacy['quantity'] == 1
        old = await request('GET', f'/api/laptops/{ASSET_ID}')
        assert old == legacy
        cost = await request('GET', f'/api/hardware/{ASSET_ID}/hardware-cost')
        assert cost['hardware_id'] == str(ASSET_ID) and cost['laptop_id'] == str(ASSET_ID) and cost['amount'] == 1234.50
        for prefix in ('hardware', 'laptop'):
            attachments = await request('GET', f'/api/attachments/{prefix}/{ASSET_ID}')
            assert attachments['total_count'] == 1 and attachments['items'][0]['id'] == str(ATTACHMENT_ID)
        timeline = await request('GET', f'/api/history/hardware_assets/{ASSET_ID}')
        assert timeline['total_count'] == 1

        ids = {}
        for kind, extra in [
            ('laptop', {'serial_number': 'NEW-LAPTOP', 'operating_system': 'windows'}),
            ('phone', {'serial_number': 'IPHONE', 'operating_system': 'ios', 'imei': '123456789012345', 'imei2': '543210987654321', 'phone_number': '+81 90 1234 5678', 'os_version': '18'}),
            ('tablet', {'serial_number': 'IPAD', 'operating_system': 'ipados'}),
            ('accessory', {'quantity': 20}),
            ('peripheral', {'hardware_location_id': location_id}),
        ]:
            created = await request('POST', '/api/hardware/', 201, json={'hardware_type': kind, 'model_name': kind.title(), 'assigned_to_id': str(admin.id), **extra})
            ids[kind] = created['id']
            assert created['hardware_type'] == kind
            if kind == 'peripheral':
                assert created['hardware_location']['name'] == 'Meeting room'
            await request('PUT', f"/api/hardware/{created['id']}", json={'notes': 'Updated'})
        accessory = ids['accessory']
        await request('PUT', f'/api/hardware/{accessory}', json={'quantity': 25, 'serial_number': None})
        await request('PUT', f"/api/hardware/{ids['phone']}", 422, json={'quantity': 2})
        await request('PUT', f"/api/hardware/{ids['phone']}", 422, json={'serial_number': None})
        await request('POST', '/api/hardware/', 400, json={'model_name': 'Duplicate', 'serial_number': 'new-laptop'})
        matches = await request('GET', '/api/hardware/search?q=123456789012345')
        assert [row['id'] for row in matches] == [ids['phone']]
        matches = await request('GET', '/api/hardware/?hardware_type=peripheral')
        assert [row['id'] for row in matches] == [ids['peripheral']]
        await request('PUT', f'/api/hardware/{accessory}/hardware-cost', json={'amount': 100, 'purchase_year': 2026})
        report = await request('GET', '/api/dashboard/')
        batch_cost = next(row for row in report['cost_records'] if row['hardware_id'] == accessory)
        assert batch_cost['amount'] == 100, 'Batch cost must not be multiplied by quantity'
        profile = await request('GET', f'/api/users/{admin.id}/profile')
        assert len(profile['assigned_hardware_assets']) == 5
        assert next(row for row in profile['assigned_hardware_assets'] if row['id'] == accessory)['quantity'] == 25
        await request('POST', f'/api/hardware/{accessory}/archive')
        await request('PUT', f'/api/hardware/{accessory}', 400, json={'quantity': 30})
        await request('PUT', f'/api/hardware/{accessory}', json={'notes': 'Archived note'})
        await request('POST', f'/api/hardware/{accessory}/unarchive')
        await request('DELETE', f'/api/hardware/{accessory}', 409)
        actor.role = 'viewer'
        await request('GET', '/api/hardware/', 403)
        await request('GET', '/api/laptops/', 403)
        await request('GET', f'/api/attachments/hardware/{ASSET_ID}', 403)
        await request('GET', f'/api/history/hardware_assets/{ASSET_ID}', 403)
        await request('GET', f'/api/hardware/{accessory}/hardware-cost', 403)
        actor.role = 'admin'
        await request('POST', f'/api/hardware/{accessory}/archive')
        await request('DELETE', f'/api/hardware/{accessory}', 204)
        await request('GET', f'/api/hardware/{accessory}', 404)
        timeline = await request('GET', f'/api/history/hardware_assets/{ASSET_ID}')
        assert timeline['total_count'] == 1

    async with engine.connect() as conn:
        key = await conn.scalar(text('SELECT storage_key FROM attachments WHERE id=:id'), {'id': ATTACHMENT_ID})
        assert key == 'laptop/legacy-object.pdf'
        count = await conn.scalar(text('SELECT count(*) FROM cost_records WHERE hardware_id=:id'), {'id': uuid.UUID(accessory)})
        assert count == 0
    from app.services.admin_export_seed_json import build_seed_json_files
    from app.services.admin_export_bundle import _load_hardware_rows
    async with async_session() as db:
        files = await build_seed_json_files(db)
        assert any(name.endswith('hardware_assets.json') for name in files)
        headers, rows = await _load_hardware_rows(db)
        assert 'imei' in headers and 'quantity' in headers and len(rows) == 5
    result = subprocess.run(['alembic', 'downgrade', '047'], capture_output=True, text=True)
    assert result.returncode != 0 and 'Cannot downgrade' in result.stderr
    await engine.dispose()
    print('Hardware migration, rollback guard, legacy compatibility, all categories, costs, assignments, permissions, archive/delete and history checks passed.')


if __name__ == '__main__':
    migrate("047")
    asyncio.run(main())
