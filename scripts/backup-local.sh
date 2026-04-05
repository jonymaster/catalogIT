#!/usr/bin/env bash
# Local backup: PostgreSQL (pg_dump -Fc) + MinIO bucket mirror via Compose.
# Requires: docker compose, running db + minio services. Loads .env from repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-catalogit}"
POSTGRES_DB="${POSTGRES_DB:-catalogit}"
MINIO_BUCKET_NAME="${MINIO_BUCKET_NAME:-catalogit-attachments}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$BACKUP_DIR/$STAMP"

mkdir -p "$OUT_DIR/objects"

echo "Writing PostgreSQL dump to $OUT_DIR/postgres.dump"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" >"$OUT_DIR/postgres.dump"

echo "Mirroring s3://$MINIO_BUCKET_NAME to $OUT_DIR/objects"
docker compose run --rm --no-deps --entrypoint /bin/sh \
  -v "$OUT_DIR/objects:/backup" \
  minio -c '
    mc alias set src http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" &&
    mc mirror "src/'"$MINIO_BUCKET_NAME"'" /backup/
  '

echo "Done. Backup at $OUT_DIR"
