# Gmail (Google OAuth)

## Prerequisites

- Google Cloud project with **Gmail API** enabled.
- OAuth consent screen configured (internal or external as appropriate).
- `PUBLIC_BASE_URL` in CatalogIT matches the URL you register in Google (e.g. `https://your-host`).

## Redirect URI

Register this **exact** redirect URI for your OAuth client (Web application):

`{PUBLIC_BASE_URL}/api/integrations/google/oauth/callback`

Example: `http://localhost:8000/api/integrations/google/oauth/callback` for local API on port 8000.

## Scopes

The application requests **Gmail send** plus **userinfo.email** so the server can resolve and store the sender address (Gmail profile with fallback to OAuth2 userinfo).

(Copy the exact scope string from **Settings → Integrations** or from `GET /api/settings/integrations/meta`.)

After changing scopes in code, **reconnect Google** once so the new consent is granted.

## Steps

1. In Google Cloud Console, create OAuth 2.0 credentials and add the redirect URI above.
2. In CatalogIT **Settings → Integrations** (Gmail section): paste **Client ID** and **Client secret**, then scroll to **Email templates** (subject, HTML, optional plain text). Use `{{title}}`, `{{body}}`, `{{service_name}}`, `{{renewal_date}}`, etc. Click **Save**.
3. Click **Connect Google** and approve access. The sender address is taken from the connected account.
4. Use **Preview templates** and **Send test email** to verify.

## Troubleshooting

- **Redirect URI mismatch:** The URI in Google Cloud must match `PUBLIC_BASE_URL` + callback path exactly (scheme, host, port, path).
- **No refresh token:** Revoke CatalogIT access in the Google account security settings and connect again (the app uses `prompt=consent` for the offline refresh token).
