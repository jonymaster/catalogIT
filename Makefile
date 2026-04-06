.PHONY: backup-local release github-release release-all

TAG ?= 1.0.0

# Run from repo root with Docker Compose up (db + minio). Optional: BACKUP_DIR=/path ./scripts/backup-local.sh
backup-local:
	@./scripts/backup-local.sh

# Build and push both UI and API images with buildx bake. Override tag with: make release TAG=1.0.1
release:
	@TAG=$(TAG) docker buildx bake --push

# Create and push git tag, then publish GitHub release notes.
github-release:
	@git tag v$(TAG)
	@git push origin v$(TAG)
	@gh release create v$(TAG) --generate-notes --title "v$(TAG)"

# One-shot release: push Docker images, then create GitHub release.
release-all: release github-release
