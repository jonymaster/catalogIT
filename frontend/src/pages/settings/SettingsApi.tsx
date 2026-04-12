import { PageTransition } from "../../components/PageTransition";

export function SettingsApi() {
  return (
    <PageTransition>
    <div className="max-w-xl space-y-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">API Documentation</h2>

      <p className="text-sm text-gray-600 dark:text-gray-300">
        CatalogIT exposes a REST API powered by FastAPI. The interactive Swagger
        UI lets you explore all available endpoints, view request/response
        schemas, and try out calls directly in the browser.
      </p>

      <p className="text-sm text-gray-600 dark:text-gray-300">
        Use an API token (generated in the <strong>API Tokens</strong> tab) as a
        Bearer credential to authenticate requests.
      </p>

      <a
        href="/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        Open Swagger UI
        <span aria-hidden="true">&rarr;</span>
      </a>
    </div>
    </PageTransition>
  );
}
