import { useState, useEffect } from "react";
import client from "../../api/client";
import { IntegrationEnabledIndicator } from "../../components/IntegrationEnabledIndicator";

interface ScimStatus {
  enabled: boolean;
  endpoint_url: string;
}

export function SettingsScim() {
  const [status, setStatus] = useState<ScimStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get<ScimStatus>("/api/settings/scim")
      .then((r) => setStatus(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  }

  return (
    <div className="max-w-xl space-y-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        SCIM User Provisioning
      </h2>

      <div className="space-y-4">
        <IntegrationEnabledIndicator
          enabled={!!status?.enabled}
          disabledLabel="Not configured"
        />

        {status?.enabled && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                SCIM Endpoint URL
              </label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-3 py-2 text-sm text-gray-800 dark:text-gray-100">
                  {status.endpoint_url}
                </code>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Authentication
              </label>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                SCIM requests are authenticated with a static Bearer token
                configured via the <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">SCIM_TOKEN</code> environment variable.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Supported resources
              </label>
              <ul className="mt-1 list-inside list-disc text-sm text-gray-600 dark:text-gray-300">
                <li>GET /Users -- list provisioned users</li>
                <li>POST /Users -- create a user</li>
                <li>GET /Users/:id -- retrieve a user</li>
                <li>PATCH /Users/:id -- update a user</li>
              </ul>
            </div>
          </>
        )}

        {!status?.enabled && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            To enable SCIM provisioning, set the <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">SCIM_TOKEN</code> environment
            variable to a strong secret and restart the API server. Your
            identity provider will use this token as a Bearer credential.
          </p>
        )}
      </div>
    </div>
  );
}
