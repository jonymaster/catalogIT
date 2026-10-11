# MCP and AI assistants

CatalogIT includes a **read-only MCP server** for AI clients that support local stdio or hosted Streamable HTTP. The MCP process calls CatalogIT's REST API using an API token; it does not connect directly to PostgreSQL. Every API request is authorized as the CatalogIT user who owns the token.

The first release provides tools to search/list services, fetch a service by ID, search vendors and hardware, and read service cost records. Hardware and financial tools require the corresponding CatalogIT visibility permissions. The MCP server does not expose write operations.

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

List tools default to 50 results and accept `limit` from 1 to 100. Searching filters the API's current list response, so large catalogs may still require the API to return the complete list before the MCP server narrows the result.

Examples of questions to ask your assistant:

- “Find active services renewing in the next 90 days.”
- “Look up the vendor and status for [service name].”
- “Search laptops for serial number [serial].” (Requires hardware visibility.)
- “Summarize the service cost records for [service name].” (Requires financial visibility.)

The MCP server excludes service notes, personal contact details, hardware notes and cellular identifiers, vendor notes, and cost-record notes from its results. It does not offer arbitrary SQL, writes, or record deletion.

## Troubleshooting

- **Server does not start:** confirm `uv` is installed and the `--project` path points to the repository's `mcp` directory. The first launch needs package registry access to resolve dependencies.
- **Connection error:** verify `CATALOGIT_URL` from the MCP client's machine. With a Dockerized CatalogIT API, configure a host name that the client process can reach.
- **HTTPS configuration error:** non-loopback CatalogIT URLs must use HTTPS so the API token is protected in transit. Plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1` development instances.
- **HTTP 401:** check that the token is active, unexpired, and copied without extra whitespace.
- **HTTP 403:** the token owner's role or feature permissions do not permit that data. Review the user's CatalogIT access.
- **Hardware or costs are unavailable:** hardware lookup requires hardware visibility; cost records require financial visibility.
- **Tools do not appear:** reload the AI client after editing its MCP configuration and check the client's MCP server logs for process startup errors.

## Hosted Streamable HTTP and ChatGPT

The MCP service also supports Streamable HTTP at `/mcp`. It calls CatalogIT's REST API and forwards the bearer token supplied by the MCP client. CatalogIT validates that token on each API request, applies the token owner's role and hardware/financial permissions, and records API audit events as that user. MCP itself still exposes read-only tools.

For ChatGPT's bearer-token configuration, create an API token in **Settings → API Tokens** and enter it as the MCP server bearer token. This is a static CatalogIT API token, not an OAuth login. Give the token to an account with the minimum role and feature permissions needed, and revoke it in CatalogIT if it is exposed. If ChatGPT stores one shared token for a workspace connection, all users of that connection act with that token owner's permissions. OAuth can be added later to provide a separate sign-in/consent flow for each user.

### Deploy the endpoint

1. Build and push the multi-architecture images from the repository root: `make release TAG=<version>`. This publishes `jonymaster/catalogit-mcp` along with the UI and API images.
2. Update the production Compose stack to include the `mcp` service from `docker-compose.server.yml`. It listens on container port `8000` and reaches the API internally at `http://api:8000`. The optional host mapping defaults to loopback port `8002`; set `MCP_PUBLISH` for a different port.
3. In your reverse proxy, route `/mcp` to the MCP service on port `8000` over a private/shared container network. Preserve the `/mcp` path when proxying and serve it over HTTPS. Set `MCP_ALLOWED_HOSTS` to the external hostname (include a `hostname:*` entry if the proxy sends a port in the Host header); set `MCP_ALLOWED_ORIGINS` if your client sends an Origin header.
4. Connect ChatGPT to `https://<your-catalogit-hostname>/mcp`, select its bearer-token authentication option, and enter the CatalogIT API token. Scan the tools and try a read-only lookup.

The HTTP server requires a bearer token when a tool calls CatalogIT; missing, revoked, or expired tokens are rejected by the CatalogIT API. PostgreSQL remains private and is never accessed by the MCP service. ChatGPT plan and workspace settings determine whether custom MCP apps are available; see [OpenAI's ChatGPT MCP app instructions](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
