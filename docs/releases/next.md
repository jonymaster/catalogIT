# Next release

## Bundled object storage switches from MinIO to Silo

Both Docker Compose stacks now use [Silo](https://github.com/pgsty/silo), the community-maintained MinIO fork, pinned to `RELEASE.2026-09-16T00-00-00Z` and its published multi-platform image digest. The classic image includes the `mc` compatibility alias used by our backup script.

No CatalogIT database migration or application configuration change is required for this storage switch. The Compose service remains `minio`, the development volume remains `minio_data`, and the server bind mount remains `MINIO_DATA_PATH`. Keep your existing Compose project/stack name, bucket name, credentials, endpoint, and `MINIO_*` variables. Do not rename or delete existing volumes. Amazon S3 and externally managed storage are unaffected unless you separately upgrade that storage server.

### Existing Compose installations

1. Before updating, record the running MinIO version/image digest and retain your old Compose file and configuration. Read the [upstream migration guide](https://silo.pgsty.com/compatibility/migration/) and [selected release requirements](https://github.com/pgsty/silo/releases/tag/RELEASE.2026-09-16T00-00-00Z). Old filesystem/gateway deployments and custom IAM, encryption, or replicated installations need their version-specific checks; do not assume every historical MinIO release supports a direct replacement.
2. Pull the new image, then pause application traffic and other writers. Stop the API and cron service (if enabled), leaving PostgreSQL available for its backup. Back up PostgreSQL, then stop MinIO and snapshot/copy its entire data volume or directory, including `.minio.sys`. Keep configuration, credentials, and any encryption key material securely. `make backup-local` provides an object mirror, but does not replace this full storage-state backup.
3. Recreate only the storage container with the updated Compose file. For the default development stack, after completing the backup steps:

   ```sh
   docker compose pull minio
   docker compose up -d --no-deps --wait minio
   docker compose start api
   ```

   For the server stack, use `docker compose -f docker-compose.server.yml --env-file .env` in place of `docker compose` in these commands. For Portainer, preserve the stack name, environment and bind mounts, and recreate the storage service from the updated definition after the same backup and write-pause steps. Never use `down -v` during this upgrade.
4. Before reopening traffic, download an existing attachment and upload, download, and delete a temporary one. Check any uploaded email templates/inline images and an admin export. API startup alone is insufficient because storage initialization failures currently only produce a warning. Resume the cron service if it was previously enabled, then check logs and your next backup.

Fresh installations can use the normal Quick Start without migration steps. Existing installations normally reuse their object data in place; no bucket export/import is required for compatible deployments.

### Recovery

If validation fails, keep traffic and writers paused. Stop Silo and restore the original image/configuration and the matching pre-upgrade storage recovery point; restore PostgreSQL as needed to keep it consistent with object storage. Do not simply run the old image against Silo-modified state: this release changes durable IAM state and does not support rolling downgrade. Never run old and new servers against the same writable storage. If writes have resumed, preserve and reconcile subsequent database/object changes before restoring an older snapshot to avoid losing them.
