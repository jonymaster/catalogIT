import { useState, useEffect, useMemo } from "react";
import client from "../api/client";
import { Badge } from "../components/Badge";
import { SearchInput } from "../components/SearchInput";
import { useToast } from "../context/useToast";
import type { User } from "../types/models";

const ROLES = ["admin", "editor", "viewer"] as const;

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { role: string; is_active: boolean }>
  >({});
  const { showToast } = useToast();

  useEffect(() => {
    client
      .get<User[]>("/api/settings/users/")
      .then((r) => setUsers(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  async function updateUser(userId: string, patch: Partial<User>) {
    setSaving(userId);
    try {
      const res = await client.patch<User>(
        `/api/settings/users/${userId}`,
        patch,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? res.data : u)),
      );
      showToast({ type: "success", text: "User updated." });
      return true;
    } catch (err: unknown) {
      const detail =
        err instanceof Object && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      showToast({
        type: "error",
        text: detail || "Failed to update user.",
      });
      return false;
    } finally {
      setSaving(null);
    }
  }

  function startEditing(user: User) {
    setEditingUserId(user.id);
    setDrafts((current) => ({
      ...current,
      [user.id]: {
        role: user.role,
        is_active: user.is_active,
      },
    }));
  }

  function cancelEditing(userId: string) {
    setEditingUserId((current) => (current === userId ? null : current));
    setDrafts((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  async function saveEditing(userId: string) {
    const draft = drafts[userId];
    if (!draft) {
      return;
    }

    const succeeded = await updateUser(userId, draft);
    if (succeeded) {
      cancelEditing(userId);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage user roles and access.
          </p>
        </div>
        <span className="text-sm text-gray-500">
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search users..."
            />
          </div>
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
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-gray-500"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {user.first_name} {user.last_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {user.department || "--"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {editingUserId === user.id ? (
                        <select
                          value={drafts[user.id]?.role ?? user.role}
                          disabled={saving === user.id}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                role: e.target.value,
                                is_active:
                                  current[user.id]?.is_active ?? user.is_active,
                              },
                            }))
                          }
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-gray-700">{user.role}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {editingUserId === user.id ? (
                        <button
                          type="button"
                          disabled={saving === user.id}
                          onClick={() =>
                            setDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                role: current[user.id]?.role ?? user.role,
                                is_active:
                                  !(current[user.id]?.is_active ?? user.is_active),
                              },
                            }))
                          }
                          className="rounded-md transition-opacity disabled:opacity-50"
                        >
                          <Badge
                            color={
                              (drafts[user.id]?.is_active ?? user.is_active)
                                ? "green"
                                : "red"
                            }
                          >
                            {(drafts[user.id]?.is_active ?? user.is_active)
                              ? "Active"
                              : "Inactive"}
                          </Badge>
                        </button>
                      ) : (
                        <Badge color={user.is_active ? "green" : "red"}>
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {editingUserId === user.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => saveEditing(user.id)}
                            disabled={saving === user.id}
                            className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                          >
                            <CheckIcon />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEditing(user.id)}
                            disabled={saving === user.id}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                          >
                            <CloseIcon />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(user)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          <PencilIcon />
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a2.25 2.25 0 1 1 3.182 3.182L10.582 17.13a4.5 4.5 0 0 1-1.897 1.13L6 19l.74-2.685a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}
