# Build context is ./backend (not the repo root). ``sample_data/*.json`` is included for SEED_SAMPLE_DATA.
#
#   docker buildx build --platform linux/amd64,linux/arm64 -t jonymaster/catalogit-api:1.1.1 -t jonymaster/catalogit-api:latest --push ./backend
#
# For local load only: add --load (single-platform) instead of --push.

FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

COPY . .
RUN uv sync --no-dev

FROM python:3.12-slim

RUN adduser --disabled-password --gecos "" appuser

WORKDIR /app
COPY --from=builder /app /app

# Builder leaves source trees as root-only (e.g. mode 750/640); appuser must read /app/app and .venv.
RUN chown -R appuser:appuser /app

ENV PATH="/app/.venv/bin:$PATH"
# Bundled JSON for ``SEED_SAMPLE_DATA=true`` (see ``scripts/seed_from_json.py``).
ENV SEED_DIR=/app/sample_data

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
