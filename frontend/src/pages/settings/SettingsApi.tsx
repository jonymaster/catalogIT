export function SettingsApi() {
  return (
    <div className="max-w-xl space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-medium text-gray-900">API Documentation</h2>

      <p className="text-sm text-gray-600">
        CatalogIT exposes a REST API powered by FastAPI. The interactive Swagger
        UI lets you explore all available endpoints, view request/response
        schemas, and try out calls directly in the browser.
      </p>

      <p className="text-sm text-gray-600">
        Use an API token (generated in the <strong>API Tokens</strong> tab) as a
        Bearer credential to authenticate requests.
      </p>

      <a
        href="/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Open Swagger UI
        <span aria-hidden="true">&rarr;</span>
      </a>
    </div>
  );
}
