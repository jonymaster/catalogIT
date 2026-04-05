import { useState, useEffect, useRef, type FormEvent } from "react";
import client from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { formatDateTime } from "../../utils/formatting";

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  created_by_id: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_revoked: boolean;
}

interface ApiTokenCreated extends ApiToken {
  raw_token: string;
}

export function SettingsTokens() {
  const { preferences } = useAuth();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalToken, setModalToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function loadTokens() {
    client
      .get<ApiToken[]>("/api/settings/tokens/")
      .then((r) => setTokens(r.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTokens();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await client.post<ApiTokenCreated>("/api/settings/tokens/", {
        name: name.trim(),
      });
      setModalToken(res.data.raw_token);
      setCopied(false);
      setName("");
      dialogRef.current?.showModal();
      loadTokens();
    } catch {
      setError("Failed to generate token.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    await client.delete(`/api/settings/tokens/${tokenId}`);
    loadTokens();
  }

  function handleCopy() {
    if (modalToken) {
      navigator.clipboard.writeText(modalToken);
      setCopied(true);
    }
  }

  function handleCloseModal() {
    dialogRef.current?.close();
    setModalToken(null);
    setCopied(false);
  }

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">API Tokens</h2>

      <form
        onSubmit={handleCreate}
        className="flex items-end gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
      >
        <div className="flex-1">
          <label
            htmlFor="token_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Token name
          </label>
          <input
            id="token_name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI pipeline"
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-gray-500 dark:focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:focus:ring-gray-400"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 transition-colors hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
        >
          {creating ? "Generating..." : "Generate token"}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      )}

      {/* One-time token reveal modal */}
      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-lg border border-gray-200 dark:border-gray-700 p-0 shadow-xl backdrop:bg-black/40 open:fixed open:top-1/2 open:left-1/2 open:-translate-x-1/2 open:-translate-y-1/2 open:m-0"
        onClose={() => { setModalToken(null); setCopied(false); }}
      >
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Token created
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Copy this token now. For security reasons it will not be shown again
            after you close this dialog.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 select-all">
              {modalToken}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCloseModal}
              className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 transition-colors hover:bg-gray-800 dark:hover:bg-gray-200"
            >
              Done
            </button>
          </div>
        </div>
      </dialog>

      {tokens.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No API tokens yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-950">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Token
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Last used
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {tokens.map((t) => (
                <tr key={t.id} className={t.is_revoked ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {t.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-500 dark:text-gray-400">
                    {t.token_prefix}{"••••••••"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDateTime(t.created_at, preferences, {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {t.last_used_at
                      ? formatDateTime(t.last_used_at, preferences, {
                          dateStyle: "medium",
                        })
                      : "Never"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        t.is_revoked
                          ? "bg-red-100 text-red-800 dark:text-red-200"
                          : "bg-green-100 text-green-800 dark:text-green-200"
                      }`}
                    >
                      {t.is_revoked ? "Revoked" : "Active"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {!t.is_revoked && (
                      <button
                        onClick={() => handleRevoke(t.id)}
                        className="text-sm text-red-600 hover:text-red-800 dark:text-red-200"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
