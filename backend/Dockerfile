# Build context is ./backend (not the repo root).
#
#   docker buildx build --platform linux/amd64,linux/arm64 -t jonymaster/catalogit-api:1.0.0 --push ./backend
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

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
