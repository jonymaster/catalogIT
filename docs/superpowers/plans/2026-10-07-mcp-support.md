# MCP support implementation plan

## Goal

Let AI assistants work with CatalogIT through a small, understandable MCP toolset. Start with read-only access, then add selected write actions behind CatalogIT's existing authorization and audit controls. Keep the MCP interface independent of any one AI vendor so the same server can serve multiple compatible clients.

## Recommended shape

Build an MCP adapter that calls the existing CatalogIT REST API using a dedicated CatalogIT API token. Do not give the MCP process a PostgreSQL connection or expose arbitrary SQL: direct database access would bypass endpoint validation, feature permissions, and the user-attributed audit path.

### MCP authentication decision

The immediate ChatGPT setup uses a manually provided CatalogIT API bearer token. Streamable HTTP forwards that token to the existing REST API, which validates it and enforces the token owner's current role and hardware/financial permissions. This avoids introducing a new token issuer for the urgent read-only release. If the ChatGPT connection shares one configured bearer token across users, they share that CatalogIT identity and its permissions.

OAuth remains a later option for a per-user Authenticate/consent flow. If added, keep it separate from the existing **Settings → OIDC** login-provider configuration: today's OIDC makes CatalogIT an Okta client for web sign-in, not an authorization server for MCP. Use Okta only after confirming custom authorization server support, ChatGPT's resource/audience and registration requirements, and mapping Okta subject to an active CatalogIT user. Do not silently grant a shared service account's permissions to other people.

Offer two ways to run/connect, subject to client support:

- **Local stdio:** the AI client launches the MCP process on the user's machine; it calls the configured CatalogIT API URL. This fits a self-hosted instance reachable from that machine.
- **Hosted Streamable HTTP:** a separately deployable MCP endpoint for clients that can connect to remote MCP servers. Protect it with authenticated HTTPS and pass CatalogIT credentials securely. Do not expose an unauthenticated endpoint.

Prefer the MCP project's maintained Python SDK and Streamable HTTP for remote deployments; stdio remains useful for local launches. Keep the MCP adapter as a separate package/service initially. This limits changes to the core API and lets MCP dependencies and deployment be optional. Revisit mounting into FastAPI only if it gives a clear operational benefit.

## Phases

**Current state (2026-10-11):** The `mcp/` adapter provides read-only service, vendor, hardware, and service-cost tools over CatalogIT REST. It supports local stdio and hosted Streamable HTTP at `/mcp`, forwarding the request bearer token to CatalogIT. The production image/Compose service and ChatGPT setup guidance are included. OAuth-based per-user login, selected writes, and broader AI plugin work remain future work.

### Phase 0 — contract and access model

- Confirm the first user workflows and the CatalogIT instance URL/network reachability.
- Create a dedicated API token from an account with the least role and feature permissions needed. Document that API tokens inherit the creating user's permissions; use an admin token only when a workflow requires admin-only APIs.
- Define stable MCP tool names, concise descriptions, typed inputs, output limits, and error behavior. Keep secrets out of tool arguments and results.
- Decide whether the first delivery is local stdio, remote Streamable HTTP, or both. Default to stdio for a first self-hosted pilot; remote access needs TLS and a clear authentication deployment design.

### Phase 1 — read-only MVP (implemented)

Implemented tools for common lookup workflows:

- Search/list and fetch services, including status, owner, vendor, tags, and renewal information.
- List/fetch vendors and reference data needed to interpret catalog records.
- Search/list and fetch hardware assets only when the token has hardware visibility permission.
- Read cost records and financial summaries only when the token has financial visibility permission.
- Optionally expose record history as a read-only tool, after reviewing the history route's allowed tables and response volume.

Use bounded pagination/results and explicit filters. Return only fields intended for the caller; do not expose user secrets, integration credentials, API token hashes, or internal configuration. Reuse REST endpoint behavior, including permission failures, rather than reimplementing business rules in MCP.

Deliverables: adapter package, container/development entry point, environment configuration, setup guide, and focused tests for schemas, access-denied behavior, and result limits.

### Phase 2 — pilot and hardening

- Add Streamable HTTP serving and package the MCP process as an optional production service/image. **Implemented.**
- Forward bearer tokens from each HTTP request to the existing CatalogIT REST API. **Implemented.**
- Publish the MCP route over HTTPS and add it to the reverse proxy without making PostgreSQL or internal app endpoints public. **Deployment operator step remains.**
- ChatGPT users configure the custom MCP app with a CatalogIT API bearer token and scan the read-only tools. **Documented; live connection remains to be configured.**
- Later: add an OAuth-based per-user Authenticate flow after confirming Okta support and ChatGPT OAuth requirements.

- Test with representative MCP clients and a non-production CatalogIT instance.
- Verify token revocation/expiry take effect, denied financial/hardware access is respected, errors do not leak credentials, and logs avoid bearer tokens or sensitive record data.
- Add request timeouts, safe retry behavior for reads, clear API-unavailable errors, and operational health checks.
- Document network requirements and reverse-proxy routing for hosted Streamable HTTP. Keep the route behind HTTPS; CatalogIT API bearer tokens are required for tool calls.

### Phase 3 — selected writes

Add write tools one action at a time, based on pilot feedback. Candidate first writes are creating/updating a service, tag, or vendor. Use existing API endpoints so schema validation, role checks, audit attribution, and database rules still apply.

Requirements for each write:

- Require an editor/admin token as required by the API endpoint; do not treat MCP tool availability as authorization.
- Use narrow, typed arguments and return the resulting record and stable identifier.
- Require an explicit record ID for updates and deletions. Exclude deletes and other irreversible actions from the initial write phase.
- Make the tool description state that it changes CatalogIT data. Do not add implicit bulk updates or arbitrary patch/SQL tools.
- Test authorization, invalid references, duplicate/conflict responses, and audit records.

Possible later additions include selected cost/hardware writes (with their respective permissions), archive/unarchive operations, and carefully designed batch operations. User administration, password changes, API token management, integration secrets, attachment deletion, and permanent record deletion should remain out of scope unless separately justified and reviewed.

### Phase 4 — broader AI client and plugin support

Keep a canonical MCP server and add vendor/client-specific connection instructions rather than forking tool implementations. Prioritize current MCP-capable clients used by the project owner and users, likely including Claude Desktop, ChatGPT/Codex, Cursor, and VS Code/Copilot where supported. Verify each client's current remote/local configuration and authentication requirements at implementation time; client capabilities and setup syntax change over time.

If a client does not support the MCP transport or auth method, consider a small provider-specific connector/plugin only when there is a concrete user workflow. Avoid building separate integrations for every AI product before the shared MCP contract is stable.

## Repository touchpoints

- `backend/app/routers/`: current API routes to call, rather than bypass.
- `backend/app/dependencies/auth.py`: API-token authentication and permission checks.
- `backend/app/dependencies/db.py`: audited database session used by write routes.
- `backend/app/schemas/`: API input/output contracts to reuse as design references.
- `backend/pyproject.toml`: add MCP SDK only if the server lives in the backend package; otherwise give the adapter its own dependency manifest.
- `docker-compose.yml` and `docker-compose.server.yml`: optional MCP service and configuration if hosted mode is selected.
- `docs/integrations/mcp.md`: end-user setup and usage guide.

## Acceptance criteria

### Read-only release

- A supported MCP client can connect to a CatalogIT instance with a dedicated API token.
- The first tools support service and vendor lookup; hardware and financial reads honor the existing feature permissions.
- Results are bounded, typed, and exclude credential/configuration secrets.
- Expired, revoked, insufficiently privileged, or unavailable API cases return actionable errors without exposing the bearer token.
- CatalogIT API bearer tokens are validated by the existing API and honor the token owner's role and feature permissions.
- Setup, security, and supported-client instructions are documented.

### Write expansion

- Each approved write maps to a specific existing API action and enforces the API's current authorization rules.
- Writes create normal CatalogIT audit entries attributed to the token owner.
- Each tool has explicit input scope; no arbitrary SQL or unrestricted generic mutation tool exists.
- Destructive operations require a separate decision and are not enabled by default.

## Estimate

Planning estimate: roughly 1–3 engineering days for a focused read-only local MVP; 3–7 days for a read-only hosted/pilot-ready release depending on auth and deployment requirements; then incremental work for each selected write. Client-specific setup, remote authentication, and support expectations can increase the hosted scope. Re-estimate after Phase 0 confirms transport and first workflows.
