# MCP and AI assistants

CatalogIT includes a **read-only MCP server** for AI clients that support local stdio or hosted Streamable HTTP. The MCP process calls CatalogIT's REST API using an API token; it does not connect directly to PostgreSQL. Every API request is authorized as the CatalogIT user who owns the token.

The first release provides tools to search/list services, fetch a service by ID, search vendors and hardware, read service cost records, read the change history of a record, and (for admins) read the global audit log. Hardware and financial tools require the corresponding CatalogIT visibility permissions. The MCP server does not expose write operations.

## Requirements

- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/) to install and launch the MCP package
- A reachable CatalogIT API, such as `http://localhost:8000` for a local Compose install
- An API token from **Settings → API Tokens**
- An MCP-compatible client that supports local stdio or remote Streamable HTTP

## Create a token

Create a dedicated CatalogIT user for the assistant, then create an API token while signed in as that user. Tokens inherit the user's role and feature permissions. Start with a viewer account and grant financial or hardware visibility only if the workflow needs it. Store the token as a secret in your AI client's MCP configuration; treat it like a password and revoke it in **Settings → API Tokens** if exposed.

The MCP tool surface is read-only, even if the token belongs to an editor. Do not reuse an admin token when a lower-privilege account is sufficient.

## Configure a local MCP client

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) on the same machine as the MCP client. Find the CatalogIT checkout path and add a server entry to the client's MCP configuration. Many clients use a JSON structure like this; consult your client's settings UI for the location and exact format:

```json
{
  "mcpServers": {
    "catalogit": {
      "command": "uv",
      "args": [
        "run",
        "--project",
        "/absolute/path/to/catalogIT/mcp",
        "catalogit-mcp"
      ],
      "env": {
        "CATALOGIT_URL": "http://localhost:8000",
        "CATALOGIT_API_TOKEN": "paste-your-token-here"
      }
    }
  }
}
```

Replace the project path, URL, and token. The first launch resolves the Python dependencies. The client launches the process locally; the CatalogIT URL must be reachable from that machine. For an API running on another Docker container, `localhost` refers to the MCP client's machine, not that container. Use the API's reachable host name and port.

Restart or reload the AI client, then confirm that the CatalogIT tools appear in its MCP/tool list. Do not add quotes or status output to the server's stdout; stdio carries the MCP protocol.

## Available read-only tools

| Tool | Purpose | Permission |
| --- | --- | --- |
| `list_services` | List active services or archived services; optionally filter by name, description, vendor, category, status, or tag | Catalog access; financial fields are scrubbed by the API when not allowed |
| `get_service` | Fetch a service by UUID | Catalog access; financial fields are scrubbed by the API when not allowed |
| `list_vendors` | List or search vendors by name | Catalog access |
| `list_hardware_assets` | Search assets by model, serial, status, or location; optionally filter by hardware type or archive state | Hardware visibility |
| `get_service_cost_records` | Read costs for a service | Financial visibility |
| `get_record_history` | Read the change history of a service, hardware asset, vendor, or tag by UUID, newest first; service and hardware history include attachment changes | Catalog access; hardware history requires hardware visibility |
| `list_audit_events` | Read the global audit log, newest first; optionally filter by category (`data_change`, `security`, `notification`, `error`) | Admin |

List tools default to 50 results and accept `limit` from 1 to 100. `get_record_history` and `list_audit_events` are paginated instead: they accept `page` (from 1) and `per_page` (from 1 to 100) and return `total_pages`. Searching filters the API's current list response, so large catalogs may still require the API to return the complete list before the MCP server narrows the result.

Examples of questions to ask your assistant:

- “Find active services renewing in the next 90 days.”
- “Look up the vendor and status for [service name].”
- “Search laptops for serial number [serial].” (Requires hardware visibility.)
- “Summarize the service cost records for [service name].” (Requires financial visibility.)
- “Who changed the status of [service name], and when?”
- “List this week's failed sign-ins.” (Requires an admin account.)

The MCP server excludes service notes, personal contact details, hardware notes and cellular identifiers, vendor notes, and cost-record notes from its results. History values also omit hardware assignees, cost centers, payment methods, and attachment storage keys. History and audit results name the person who made a change but not their email address. `list_audit_events` returns each event's summary and, for data changes, only the names of changed fields; use `get_record_history` to see values. It does not offer arbitrary SQL, writes, or record deletion.

## Troubleshooting

- **Server does not start:** confirm `uv` is installed and the `--project` path points to the repository's `mcp` directory. The first launch needs package registry access to resolve dependencies.
- **Connection error:** verify `CATALOGIT_URL` from the MCP client's machine. With a Dockerized CatalogIT API, configure a host name that the client process can reach.
- **HTTPS configuration error:** non-loopback CatalogIT URLs must use HTTPS so the API token is protected in transit. Plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1` development instances.
- **HTTP 401:** check that the token is active, unexpired, and copied without extra whitespace.
- **HTTP 403:** the token owner's role or feature permissions do not permit that data. Review the user's CatalogIT access.
- **Hardware or costs are unavailable:** hardware lookup requires hardware visibility; cost records require financial visibility.
- **Tools do not appear:** reload the AI client after editing its MCP configuration and check the client's MCP server logs for process startup errors.

## Hosted Streamable HTTP

The MCP service also supports Streamable HTTP at `/mcp`. It calls CatalogIT's REST API and forwards the caller's credential. CatalogIT validates that credential on each API request, applies the user's role and hardware/financial permissions, and records API audit events as that user. MCP itself still exposes read-only tools.

A hosted connection can authenticate in two ways:

| Method | Clients | How |
| --- | --- | --- |
| Static API token | Claude Code, Claude Desktop (stdio), other clients that send custom headers | Send `Authorization: Bearer <CatalogIT API token>` |
| OAuth sign-in | Claude.ai custom connectors, ChatGPT developer mode | Bring your own OAuth provider and configure it in **Settings → MCP Sign-in** |

ChatGPT and Claude.ai custom connectors do not accept a pasted static bearer token; use OAuth sign-in for them.

### Deploy the endpoint

1. Build and push the multi-architecture images from the repository root: `make release TAG=<version>`. This publishes `jonymaster/catalogit-mcp` along with the UI and API images.
2. Add the `mcp` service from `docker-compose.server.yml` to the production stack. It listens on container port `8000` and reaches the API internally at `http://api:8000`. Set `MCP_ALLOWED_HOSTS` to the external hostname (include a `hostname:*` entry if the proxy sends a port in the Host header); set `MCP_ALLOWED_ORIGINS` if your client sends an Origin header.
3. The UI image proxies `/mcp` to the `mcp` service, like `/api`. If your reverse proxy routes everything to the UI container, no extra rule is needed. Otherwise route `/mcp` to the MCP service on port `8000`, preserve the path and the Host header, disable response buffering, and serve it over HTTPS.
4. Check the endpoint. An `initialize` POST to `https://<host>/mcp` must return `200` with `content-type: text/event-stream`. An HTML response means `/mcp` reaches the UI instead of the MCP service; `421` means `MCP_ALLOWED_HOSTS` does not include the hostname.

### Static API token (Claude Code)

```sh
claude mcp add --transport http catalogit https://<host>/mcp \
  --header "Authorization: Bearer $CATALOGIT_TOKEN"
```

If an authenticating proxy protects the hostname (for example Cloudflare Access), the client must also pass that proxy's credentials, such as `CF-Access-Client-Id` and `CF-Access-Client-Secret` for an Access service token with a **Service Auth** policy.

### OAuth sign-in (bring your own provider)

CatalogIT does not run an OAuth server. An external issuer runs the sign-in, and CatalogIT trusts the JWT access tokens it signs:

1. The AI client calls `/mcp`, receives `401` with OAuth discovery metadata, and opens the provider's sign-in page.
2. The user signs in; the client receives an access token and calls `/mcp` again.
3. The MCP service forwards the token (or the proxy's identity JWT, see `MCP_IDENTITY_HEADER`) to the API.
4. The API validates signature, issuer, audience, and expiry against **Settings → MCP Sign-in**, then maps the configured claim (default `email`) to an existing active CatalogIT user. Tokens never create users.

Configure **Settings → MCP Sign-in** as an admin:

- **Issuer URL:** must equal the token's `iss` claim.
- **JWKS URL:** the issuer's signing keys. Leave blank to discover it from `<issuer>/.well-known/openid-configuration`.
- **Audience:** must be one of the token's `aud` values.
- **Email claim:** the claim holding the user's email.

Use **Test signing keys** to confirm CatalogIT can fetch the keys, then enable the issuer.

#### Cloudflare Access Managed OAuth

If Cloudflare Access already protects your CatalogIT hostname, Access can act as the OAuth server for `/mcp`, using your existing identity provider (for example Okta) for sign-in.

1. In Cloudflare Zero Trust, create a self-hosted Access application for `<host>/mcp` with the same allow policy as the main application. A more specific path takes precedence over the hostname application.
2. In the application's advanced settings, enable **Managed OAuth** and dynamic client registration. Cloudflare recommends a short access-token lifetime (5–15 minutes) with a longer session.
3. Copy the application's **AUD tag**.
4. Set `MCP_IDENTITY_HEADER=Cf-Access-Jwt-Assertion` for the `mcp` service. Access sends the signed user identity in that header; the MCP service forwards it to the API.
5. In **Settings → MCP Sign-in**, set:
   - Issuer URL: `https://<team>.cloudflareaccess.com`
   - JWKS URL: `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`
   - Audience: the AUD tag
   - Email claim: `email`
6. Add the connector in Claude or ChatGPT with URL `https://<host>/mcp` and OAuth authentication. Sign in when prompted.

The CatalogIT API validates the Access JWT itself, so a request that bypasses Cloudflare with a forged header is rejected.

#### Other providers

Any issuer that signs JWT access tokens with a published JWKS works, for example an Okta custom authorization server. The AI client must be able to register with the provider (dynamic client registration) or accept a pre-registered client ID and secret. Serving OAuth discovery metadata directly from the MCP service, without a proxy such as Cloudflare Access, is not implemented yet.

PostgreSQL remains private and is never accessed by the MCP service. ChatGPT plan and workspace settings determine whether custom MCP apps are available; see [OpenAI's ChatGPT MCP app instructions](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
