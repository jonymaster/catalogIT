import { useState, useEffect } from "react";
import client from "../../api/client";

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
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="max-w-xl space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-medium text-gray-900">
        SCIM User Provisioning
      </h2>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              status?.enabled ? "bg-green-500" : "bg-gray-300"
            }`}
          />
          <span className="text-sm font-medium text-gray-700">
            {status?.enabled ? "Enabled" : "Not configured"}
          </span>
        </div>

        {status?.enabled && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                SCIM Endpoint URL
              </label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                  {window.location.origin}{status.endpoint_url}
                </code>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Authentication
              </label>
              <p className="mt-1 text-sm text-gray-500">
                SCIM requests are authenticated with a static Bearer token
                configured via the <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">SCIM_TOKEN</code> environment variable.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Supported resources
              </label>
              <ul className="mt-1 list-inside list-disc text-sm text-gray-600">
                <li>GET /Users -- list provisioned users</li>
                <li>POST /Users -- create a user</li>
                <li>GET /Users/:id -- retrieve a user</li>
                <li>PATCH /Users/:id -- update a user</li>
              </ul>
            </div>
          </>
        )}

        {!status?.enabled && (
          <p className="text-sm text-gray-500">
            To enable SCIM provisioning, set the <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">SCIM_TOKEN</code> environment
            variable to a strong secret and restart the API server. Your
            identity provider will use this token as a Bearer credential.
          </p>
        )}
      </div>
    </div>
  );
}
