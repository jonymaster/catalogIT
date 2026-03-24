import { useState, useEffect } from "react";
import client from "../../api/client";
import type { User } from "../../types/models";

const ROLES = ["admin", "editor", "viewer"] as const;

export function SettingsUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    client
      .get<User[]>("/api/settings/users/")
      .then((r) => setUsers(r.data))
      .finally(() => setLoading(false));
  }, []);

  async function updateUser(userId: string, patch: Partial<User>) {
    setSaving(userId);
    setMessage(null);
    try {
      const res = await client.patch<User>(
        `/api/settings/users/${userId}`,
        patch,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? res.data : u)),
      );
      setMessage({ type: "success", text: "User updated." });
    } catch (err: unknown) {
      const detail =
        err instanceof Object && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      setMessage({
        type: "error",
        text: detail || "Failed to update user.",
      });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Manage Users</h2>
        <span className="text-sm text-gray-500">
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Active
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                  {user.first_name} {user.last_name}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {user.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <select
                    value={user.role}
                    disabled={saving === user.id}
                    onChange={(e) =>
                      updateUser(user.id, { role: e.target.value })
                    }
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <button
                    disabled={saving === user.id}
                    onClick={() =>
                      updateUser(user.id, { is_active: !user.is_active })
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      user.is_active
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "bg-red-100 text-red-800 hover:bg-red-200"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
