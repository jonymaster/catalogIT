# Slack

## Prerequisites

- A Slack workspace where you can install apps.
- `PUBLIC_BASE_URL` matches the URL registered in the Slack app.

## Redirect URI

`{PUBLIC_BASE_URL}/api/integrations/slack/oauth/callback`

## Scopes

The app requests bot scopes for posting messages and listing channels (see `GET /api/settings/integrations/meta` or [constants](../../backend/app/integrations/constants.py) for the exact comma-separated list).

## Client ID and Client Secret (not Signing Secret)

In **Settings → Basic Information → App Credentials**:

- **Client ID** and **Client Secret** are used for OAuth (what CatalogIT needs).
- **Signing Secret** (on the same page) is for verifying that incoming HTTP requests really come from Slack. It is **not** the OAuth client secret and will cause errors such as `bad_client_secret` if pasted into CatalogIT.

## Steps

1. Create a Slack app (use [slack-app-manifest.yaml](slack-app-manifest.yaml) as a starting point; replace redirect URLs).
2. Add the redirect URI above under **OAuth & Permissions**.
3. In CatalogIT **Settings → Integrations → Slack**, paste **Client ID** and **OAuth Client Secret** from **App Credentials**, then **Save**.
4. Click **Connect Slack** and approve the installation.
5. **Invite the bot** to the target channel (`/invite @YourBot`).
6. Enter the channel as `#channel-name` or name and click **Resolve** to store the channel ID.
7. Use **Send test to Slack** to verify.

## Troubleshooting

- **`bad_client_secret`:** You almost certainly pasted the **Signing Secret** or another value. Use **Client Secret** from **App Credentials** only, then Save and Connect again.
- **Redirect URI mismatch:** Must match exactly in the Slack app settings.
- **Wrong workspace:** Reinstall the app in the correct workspace.
- **Channel not found / not_in_channel:** Invite the bot to the channel first.
