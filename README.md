# CatalogIT

Enterprise web application for managing IT Services and Hardware.

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy (async), Alembic, Uvicorn
- **Frontend:** React 18 (Vite), Tailwind CSS
- **Database:** PostgreSQL 16
- **Auth:** Okta OIDC + SCIM 2.0
- **Infrastructure:** Docker Compose (local), AWS ECS (production)

## Local Development

### Prerequisites

- Docker and Docker Compose
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js 20+ and npm

### Quick Start

1. Copy the example environment file and fill in your values:

   ```bash
   cp .env.example .env
   ```

2. Start all services:

   ```bash
   docker compose up --build
   ```

3. The services will be available at:
   - **Frontend:** http://localhost:5173
   - **API:** http://localhost:8000
   - **API docs:** http://localhost:8000/docs

### Running Migrations

```bash
docker compose exec api alembic upgrade head
```

## Outbound notifications

Admin-configured integrations (Gmail, Slack, Telegram, webhook) are documented in [docs/integrations/README.md](docs/integrations/README.md).

**Renewal reminder emails** (to service owners) use the Gmail integration. Configure global defaults and templates under **Settings → Notifications**, then schedule a daily job:

- Set `CRON_SECRET` in `.env` and call `POST /api/internal/notifications/renewal-dispatch` with header `X-Cron-Secret: <same value>` (Kubernetes CronJob, system cron, GitHub Actions, etc.), or run `python -m app.jobs.run_renewal_reminders` inside the API container.

## Project Structure

```
catalogIT/
  backend/          # FastAPI application
  frontend/         # React (Vite) application
  docs/integrations/# Integration setup (OAuth, webhooks)
  docker-compose.yml
```
