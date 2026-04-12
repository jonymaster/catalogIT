.PHONY: backup-local release github-release release-all

TAG ?= 1.1.1
BUILDER ?= catalogit-multiarch

# Run from repo root with Docker Compose up (db + minio). Optional: BACKUP_DIR=/path ./scripts/backup-local.sh
backup-local:
	@./scripts/backup-local.sh

# Build and push both UI and API images (version tag + :latest). Override: make release TAG=1.2.0
release:
	@docker buildx inspect $(BUILDER) >/dev/null 2>&1 || docker buildx create --name $(BUILDER) --driver docker-container --use
	@docker buildx use $(BUILDER)
	@docker buildx inspect --bootstrap >/dev/null
	@TAG=$(TAG) docker buildx bake --builder $(BUILDER) --push

# Create and push git tag, then publish GitHub release notes.
github-release:
	@git tag v$(TAG)
	@git push origin v$(TAG)
	@gh release create v$(TAG) --generate-notes --title "v$(TAG)"

# One-shot release: push Docker images, then create GitHub release.
release-all: release github-release
