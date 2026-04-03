# Telegram

## Prerequisites

- A Telegram bot created via [@BotFather](https://t.me/BotFather) (bot token).

## Bot token

- From @BotFather the token looks like `123456789:AAH…` (digits, colon, secret). **Do not** add a `bot` prefix to the token when pasting into CatalogIT—the API URL already contains `/bot<token>/`; a duplicate prefix breaks requests and can yield HTTP 404 from Telegram.
- After changing the token in @BotFather, update it here.

## Chat ID

- Use the numeric id (often negative for groups/supergroups, e.g. `-100…`). Send a message in the chat and resolve the id with @userinfobot or Telegram “Get updates” if needed. The bot must be allowed to message that chat (e.g. added to the group).

## Steps

1. Obtain the bot token and the target **chat ID** (user, group, or channel; for groups/channels the bot usually must be added first).
2. In **Settings → Integrations → Telegram**, paste the token and chat ID, then **Save**.
3. **Send test** to verify delivery.

## Security

Store `INTEGRATION_SECRET_KEY` so the bot token is encrypted at rest in the database.
