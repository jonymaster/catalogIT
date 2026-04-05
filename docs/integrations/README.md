# Outbound integrations

CatalogIT sends notifications through **deployment-scoped** integrations configured by admins. There is at most one configuration per channel: **Gmail (Google OAuth)**, **Slack**, **Telegram (bot token)**, and **HTTP webhook**.

- **Email copy and HTML** for Gmail (renewal reminders and test sends) are edited under **Settings → Notifications**, not here. See [Email templates](../email-templates.md).
- **Environment:** Set `PUBLIC_BASE_URL` to the URL where this API is reachable (used for OAuth redirect URIs). Set `INTEGRATION_SECRET_KEY` to a Fernet key for encrypting tokens at rest.
- **Scopes and redirect paths** are also exposed at runtime via `GET /api/settings/integrations/meta` (admin) for copy/paste into Google Cloud and Slack.

## Guides

- [Gmail (Google)](gmail.md)
- [Slack](slack.md)
- [Telegram](telegram.md)
- [Webhook](webhook.md)

## Slack app manifest

See [slack-app-manifest.yaml](slack-app-manifest.yaml): replace redirect URLs and install to your workspace.
