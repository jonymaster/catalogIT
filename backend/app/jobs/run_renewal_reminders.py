"""Run renewal reminder dispatch once. Usage: python -m app.jobs.run_renewal_reminders"""

from __future__ import annotations

import asyncio
import json
import logging

from app.database import async_session
from app.notifications.renewal_dispatch import run_renewal_dispatch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    async with async_session() as session:
        result = await run_renewal_dispatch(session)
        await session.commit()
        logger.info("%s", json.dumps(result.model_dump(), default=str))


if __name__ == "__main__":
    asyncio.run(main())
