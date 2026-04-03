"""Single source of truth for OAuth scopes, paths, and webhook contract version."""

from __future__ import annotations

# Gmail send + read email address for sender (profile/userinfo fallbacks)
GOOGLE_OAUTH_SCOPES = (
    "https://www.googleapis.com/auth/gmail.send "
    "https://www.googleapis.com/auth/userinfo.email"
)

# Slack OAuth v2 bot scopes (channel resolution + post messages)
SLACK_OAUTH_SCOPES = (
    "channels:read,groups:read,im:read,mpim:read,chat:write,users:read,team:read"
)

GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
SLACK_OAUTH_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
SLACK_OAUTH_TOKEN_URL = "https://slack.com/api/oauth.v2.access"

# OAuth callback paths (appended to PUBLIC_BASE_URL)
GOOGLE_OAUTH_CALLBACK_PATH = "/api/integrations/google/oauth/callback"
SLACK_OAUTH_CALLBACK_PATH = "/api/integrations/slack/oauth/callback"

# OAuth start paths (admin opens in browser; API validates JWT via query or session — we use admin Bearer in API and redirect)
GOOGLE_OAUTH_START_PATH = "/api/integrations/google/oauth/start"
SLACK_OAUTH_START_PATH = "/api/integrations/slack/oauth/start"

WEBHOOK_PAYLOAD_VERSION = "1"

# Documented test / notification payload shape (JSON)
WEBHOOK_PAYLOAD_EXAMPLE = {
    "version": WEBHOOK_PAYLOAD_VERSION,
    "event": "test",
    "timestamp": "2026-04-03T12:00:00Z",
    "title": "CatalogIT notification",
    "body": "Sample message",
    "metadata": {"source": "catalogit"},
}
