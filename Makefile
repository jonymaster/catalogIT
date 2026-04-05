.PHONY: backup-local

# Run from repo root with Docker Compose up (db + minio). Optional: BACKUP_DIR=/path ./scripts/backup-local.sh
backup-local:
	@./scripts/backup-local.sh
