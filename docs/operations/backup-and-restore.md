# Backup and restore

CatalogIT stores durable state in **two places**: PostgreSQL (relational data and attachment metadata) and **S3-compatible object storage** (attachment file bytes). Secrets and environment configuration live **outside** the database (see [Secrets inventory](#secrets-inventory)).

A **full backup** includes:

1. A PostgreSQL dump (or managed snapshot).
2. A copy of the attachments bucket (mirror, replication, or snapshot aligned with your risk tolerance).
3. A secure record of secrets and environment variables needed to run the app after restore.

**Restore order:** Restore **objects first** (or in parallel), then **restore the database**, then apply the same **secrets** as in production. That way attachment keys in Postgres resolve to existing objects.

**Consistency:** For a strict point-in-time copy, pause writes briefly and snapshot both layers, or accept a small skew between DB and object backup times (rarely an issue if backups run minutes apart).

Configure variables using [`.env.example`](../../.env.example) as a checklist; copy to `.env` for local Compose.

---

## Docker Compose (local development)

[`docker-compose.yml`](../../docker-compose.yml) uses named volumes:

| Volume       | Service | Purpose                                      |
|-------------|---------|----------------------------------------------|
| `pgdata`    | `db`    | PostgreSQL 16 data directory                 |
| `minio_data`| `minio` | MinIO object store (`/data`)                 |

These persist across `docker compose stop` and `docker compose down`. They are removed if you run `docker compose down -v` or delete the volumes explicitly.

The API service mounts `./data:/data`; the application code does not use `/data` today. If you store files there later, include `./data` in the same backup procedure as the database and MinIO.

### One-command backup (script)

From the repository root, with Compose running:

```bash
make backup-local
# or: ./scripts/backup-local.sh
```

See [scripts/backup-local.sh](../../scripts/backup-local.sh) and [Makefile](../../Makefile). Set `BACKUP_DIR` to write elsewhere (default: `./backups`).

### Manual: PostgreSQL dump

Adjust user and database names to match `.env` (`POSTGRES_USER`, `POSTGRES_DB`).

```bash
# Custom format (recommended for restore with pg_restore)
docker compose exec -T db pg_dump -U catalogit -Fc catalogit > pg-backup.dump
```

### Manual: MinIO bucket mirror

Using the MinIO client (`mc`) against the running Compose network (bucket name defaults to `catalogit-attachments`; override with `MINIO_BUCKET_NAME` in `.env`):

```bash
# Example: alias pointing at the MinIO service from another container on the same Compose network
mc alias set local http://localhost:9000 catalogit catalogit_local   # use MINIO_ROOT_* from .env
mc mirror local/catalogit-attachments ./backup-objects/
```

Or use `aws s3 sync` with `--endpoint-url http://localhost:9000` and the same credentials as in `.env`.

### Restore (Compose)

1. Start only infrastructure if needed: `docker compose up -d db minio`.
2. **Objects:** `mc mirror ./backup-objects/ local/catalogit-attachments` (or `aws s3 sync` with the endpoint).
3. **Database:** `docker compose exec -T db pg_restore -U catalogit -d catalogit --clean --if-exists < pg-backup.dump`  
   For a custom-format dump: `docker compose exec -T db pg_restore -U catalogit -d catalogit --clean --if-exists` with the file piped in, or copy the file into the container and run `pg_restore` there.
4. Start the API and run migrations if needed: `docker compose exec api alembic upgrade head`.

Always test restores on a **copy** of data first.

---

## AWS ECS and production

### Option A (recommended): RDS + Amazon S3

- Run **Amazon RDS for PostgreSQL** instead of Postgres in a container. Use automated backups and DB snapshots; optional point-in-time recovery.
- Store attachments in **Amazon S3** (same S3 API the app already uses). Point `MINIO_ENDPOINT` at the regional S3 endpoint, set `MINIO_BUCKET_NAME`, and use IAM credentials or an **IAM task role** on the ECS task (preferred over long-lived keys in environment variables).
- **Backup:** Rely on RDS backup/snapshot policies for the database. For S3, use versioning, cross-region replication, and optionally [AWS Backup](https://aws.amazon.com/backup/) for a single policy across RDS and S3. ECS **tasks do not need data volumes** for application state if RDS and S3 hold all data.

### Option B: Self-managed Postgres and MinIO on ECS or a server

- Mount **EBS volumes** (or **EFS** where shared storage is required) for Postgres data and for MinIO’s data directory. Do not rely on ephemeral container storage for either.
- **Postgres:** Schedule `pg_dump` (`-Fc`) to durable storage (e.g. S3), and optionally use EBS snapshots of the data volume for faster full-disk recovery.
- **MinIO:** Prefer **bucket-level backup** with `mc mirror` or `aws s3 sync` to a second bucket or off-site target. Volume-only snapshots of MinIO are possible but harder to align with a live database without a maintenance window.

### Automation and monitoring

- Run DB dumps and object mirrors on a schedule (cron, ECS scheduled task, Lambda, etc.) and alert on non-zero exit codes.
- For RDS and S3, use AWS monitoring and Backup job reports.

---

## Verification

Periodically prove that backups work:

1. Restore to an isolated **staging** environment (separate RDS instance and bucket prefix, or a second Compose project with empty volumes).
2. Apply Alembic migrations if you restore an older dump: `alembic upgrade head`.
3. Smoke-test login, CRUD, and **upload/download of an attachment**.
4. Optionally compare object count or total size between source and restored bucket.

---

## Secrets inventory

These are **not** fully captured in a database dump. Store them in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.) or another secure process; rotating them requires updating the running app configuration.

| Area | Examples (see `.env.example`) |
|------|-------------------------------|
| Database | `DATABASE_URL` (password embedded in URL for Postgres) |
| Auth / crypto | `JWT_SECRET`, `INTEGRATION_SECRET_KEY` |
| Admin bootstrap | `ADMIN_*`, `ADMIN_DEFAULT_PASSWORD` (only relevant for initial seed) |
| Integrations | `SCIM_TOKEN`, OAuth-related settings stored in DB but provider secrets in env |
| Object storage | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` |
| Cron / internal | `CRON_SECRET` |
| Compose-only (MinIO server) | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` when running MinIO yourself |

After a disaster, redeploy the application with the same logical configuration so OIDC, SCIM, and attachment URLs remain valid (`PUBLIC_BASE_URL`, `FRONTEND_URL`).
