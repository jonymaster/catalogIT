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
2. In CatalogIT **Settings → Integrations** (Gmail section): paste **Client ID** and **Client secret**, then click **Save**.
3. Click **Connect Google** and approve access. The sender address is taken from the connected account.
4. Edit **email subject and templates** under **Settings → Notifications** (not on the Integrations page). See the [Email templates](../email-templates.md) guide. Use placeholders such as `{{service_name}}`, `{{renewal_date}}`, `{{owner_name}}`, etc.
5. Use **Send test email** on the Integrations page to verify delivery. Use **Preview rendered email** on the Notifications page to preview the HTML.

## Troubleshooting

- **Redirect URI mismatch:** The URI in Google Cloud must match `PUBLIC_BASE_URL` + callback path exactly (scheme, host, port, path).
- **No refresh token:** Revoke CatalogIT access in the Google account security settings and connect again (the app uses `prompt=consent` for the offline refresh token).
