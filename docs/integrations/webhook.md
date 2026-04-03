# HTTP webhook

## Configuration

- **URL:** HTTPS endpoint that accepts `POST` with `Content-Type: application/json`.
- **Signing secret (optional):** If set, requests include header `X-CatalogIT-Signature` with the lowercase hex **HMAC-SHA256** of the raw request body using the secret as key.

## Payload

The payload shape is versioned. See `webhook_payload_version` and `webhook_payload_example` from `GET /api/settings/integrations/meta`.

## Behavior

- **Timeouts:** Short client timeout (order of seconds).
- **Retries:** A few retries with backoff on transport failures; no durable queue—delivery is best-effort without external infrastructure.
