import { useState, useEffect, useMemo } from "react";
import client from "../api/client";
import { Badge } from "../components/Badge";
import { PageTransition } from "../components/PageTransition";
import { SearchInput } from "../components/SearchInput";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { PERMISSION_FINANCIAL_VIEW } from "../constants/permissions";
import type { ProvisioningSource, User } from "../types/models";

const ROLES = ["admin", "editor", "viewer"] as const;

function sameUserId(a: string | undefined, b: string) {
  return a !== undefined && a.toLowerCase() === b.toLowerCase();
}

function formatApiError(err: unknown): string {
  const ax = err as {
    response?: { data?: { detail?: string | { message?: string } } };
  };
  const d = ax.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  return "Request failed.";
}

type UserDraft = {
  role: string;
  is_active: boolean;
  receive_renewal_notifications: boolean;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  department: string;
  financial_view: boolean;
};

function sourceBadge(src: ProvisioningSource) {
  if (src === "local") return <Badge color="gray">Manual</Badge>;
  if (src === "scim") return <Badge color="blue">SCIM</Badge>;
  return <Badge color="purple">OIDC</Badge>;
}

export function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const { showToast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    display_name: "",
    department: "",
    role: "viewer" as (typeof ROLES)[number],
    password: "",
    must_reset_password: false,
    financial_view: false,
  });
  const [creating, setCreating] = useState(false);

  const [pwdModalUser, setPwdModalUser] = useState<User | null>(null);
  const [pwdForm, setPwdForm] = useState({ new_password: "", must_reset_password: false });
  const [pwdSaving, setPwdSaving] = useState(false);

  function loadUsers() {
    return client.get<User[]>("/api/settings/users/").then((r) => setUsers(r.data));
  }

  useEffect(() => {
    loadUsers().finally(() => setLoading(false));
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

  async function updateUser(userId: string, patch: Record<string, unknown>) {
    setSaving(userId);
    try {
      const res = await client.patch<User>(`/api/settings/users/${userId}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === userId ? res.data : u)));
      showToast({ type: "success", text: "User updated." });
      return true;
    } catch (err: unknown) {
      showToast({
        type: "error",
        text: formatApiError(err),
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
        receive_renewal_notifications: user.receive_renewal_notifications ?? true,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name ?? "",
        department: user.department ?? "",
        financial_view: user.permissions?.includes(PERMISSION_FINANCIAL_VIEW) ?? false,
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
    if (!draft) return;

    const u = users.find((x) => x.id === userId);
    const patch: Record<string, unknown> = {
      role: draft.role,
      is_active: draft.is_active,
      receive_renewal_notifications: draft.receive_renewal_notifications,
    };
    if (u?.provisioning_source === "local") {
      patch.email = draft.email.trim();
      patch.first_name = draft.first_name.trim();
      patch.last_name = draft.last_name.trim();
      patch.display_name = draft.display_name.trim() || null;
      patch.department = draft.department.trim() || null;
    }
    if (draft.role !== "admin") {
      patch.permissions = draft.financial_view ? [PERMISSION_FINANCIAL_VIEW] : [];
    }

    const succeeded = await updateUser(userId, patch);
    if (succeeded) cancelEditing(userId);
  }

  async function removeUser(user: User) {
    const confirmed = window.confirm(
      `Delete user ${user.email}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);
    try {
      await client.delete(`/api/settings/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast({ type: "success", text: "User deleted." });
    } catch (err: unknown) {
      showToast({
        type: "error",
        text: formatApiError(err),
      });
    } finally {
      setDeletingUserId(null);
    }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (createForm.password.length < 8) {
      showToast({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    setCreating(true);
    try {
      const createBody: Record<string, unknown> = {
        email: createForm.email.trim(),
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        display_name: createForm.display_name.trim() || null,
        department: createForm.department.trim() || null,
        role: createForm.role,
        password: createForm.password,
        must_reset_password: createForm.must_reset_password,
      };
      if (createForm.role !== "admin") {
        createBody.permissions = createForm.financial_view ? [PERMISSION_FINANCIAL_VIEW] : [];
      }
      await client.post<User>("/api/settings/users/", createBody);
      await loadUsers();
      setCreateOpen(false);
      setCreateForm({
        email: "",
        first_name: "",
        last_name: "",
        display_name: "",
        department: "",
        role: "viewer",
        password: "",
        must_reset_password: false,
        financial_view: false,
      });
      showToast({ type: "success", text: "User created." });
    } catch (err: unknown) {
      showToast({ type: "error", text: formatApiError(err) });
    } finally {
      setCreating(false);
    }
  }

  async function submitAdminPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwdModalUser) return;
    if (pwdForm.new_password.length < 8) {
      showToast({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    setPwdSaving(true);
    try {
      await client.post(`/api/settings/users/${pwdModalUser.id}/password`, {
        new_password: pwdForm.new_password,
        must_reset_password: pwdForm.must_reset_password,
      });
      setPwdModalUser(null);
      setPwdForm({ new_password: "", must_reset_password: false });
      showToast({ type: "success", text: "Password updated." });
    } catch (err: unknown) {
      showToast({ type: "error", text: formatApiError(err) });
    } finally {
      setPwdSaving(false);
    }
  }

  function draftFor(userId: string, user: User): UserDraft {
    return (
      drafts[userId] ?? {
        role: user.role,
        is_active: user.is_active,
        receive_renewal_notifications: user.receive_renewal_notifications ?? true,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name ?? "",
        department: user.department ?? "",
        financial_view: user.permissions?.includes(PERMISSION_FINANCIAL_VIEW) ?? false,
      }
    );
  }

  return (
    <PageTransition>
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-fg"
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
          >
            People
          </h1>
          <p className="mt-1 text-[13px] text-fg-3">
            Manage user roles and access. {users.length} user
            {users.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Add user
          </button>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
          >
            <h2 id="create-user-title" className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Add user
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Creates a manually provisioned account (local password).
            </p>
            <form onSubmit={submitCreate} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">Email</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm((c) => ({ ...c, email: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">First name</label>
                  <input
                    required
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm((c) => ({ ...c, first_name: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">Last name</label>
                  <input
                    required
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm((c) => ({ ...c, last_name: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">Display name</label>
                  <input
                    value={createForm.display_name}
                    onChange={(e) => setCreateForm((c) => ({ ...c, display_name: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">Department</label>
                  <input
                    value={createForm.department}
                    onChange={(e) => setCreateForm((c) => ({ ...c, department: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => {
                      const role = e.target.value as (typeof ROLES)[number];
                      setCreateForm((c) => ({
                        ...c,
                        role,
                        financial_view: role === "admin" ? false : c.financial_view,
                      }));
                    }}
                    className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                {createForm.role !== "admin" && (
                  <div className="sm:col-span-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={createForm.financial_view}
                        onChange={(e) =>
                          setCreateForm((c) => ({ ...c, financial_view: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">
                        Financial view (IT Financial Report and dashboard cost data)
                      </span>
                    </label>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">Initial password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={(e) => setCreateForm((c) => ({ ...c, password: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input
                    id="must_reset"
                    type="checkbox"
                    checked={createForm.must_reset_password}
                    onChange={(e) =>
                      setCreateForm((c) => ({ ...c, must_reset_password: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                  />
                  <label htmlFor="must_reset" className="text-sm text-gray-700 dark:text-gray-200">
                    Require password change on first sign-in
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pwdModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Set password</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{pwdModalUser.email}</p>
            <form onSubmit={submitAdminPassword} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">New password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={pwdForm.new_password}
                  onChange={(e) => setPwdForm((c) => ({ ...c, new_password: e.target.value }))}
                  className="mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="adm_must_reset"
                  type="checkbox"
                  checked={pwdForm.must_reset_password}
                  onChange={(e) =>
                    setPwdForm((c) => ({ ...c, must_reset_password: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                />
                <label htmlFor="adm_must_reset" className="text-sm text-gray-700 dark:text-gray-200">
                  User must change password on next sign-in
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPwdModalUser(null)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {pwdSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search users..."
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Financial view
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Renewal emails
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
                {filtered.map((user) => {
                  const d = draftFor(user.id, user);
                  const editing = editingUserId === user.id;
                  const isLocal = user.provisioning_source === "local";
                  return (
                    <tr key={user.id}>
                      <td className="max-w-[14rem] px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {editing && isLocal ? (
                          <div className="flex flex-col gap-1">
                            <input
                              value={d.first_name}
                              disabled={saving === user.id}
                              onChange={(e) =>
                                setDrafts((cur) => ({
                                  ...cur,
                                  [user.id]: { ...d, first_name: e.target.value },
                                }))
                              }
                              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                              placeholder="First"
                            />
                            <input
                              value={d.last_name}
                              disabled={saving === user.id}
                              onChange={(e) =>
                                setDrafts((cur) => ({
                                  ...cur,
                                  [user.id]: { ...d, last_name: e.target.value },
                                }))
                              }
                              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                              placeholder="Last"
                            />
                          </div>
                        ) : (
                          <span className="whitespace-nowrap">
                            {user.first_name} {user.last_name}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[12rem] px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {editing && isLocal ? (
                          <input
                            type="email"
                            value={d.email}
                            disabled={saving === user.id}
                            onChange={(e) =>
                              setDrafts((cur) => ({
                                ...cur,
                                [user.id]: { ...d, email: e.target.value },
                              }))
                            }
                            className="w-full min-w-[10rem] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                          />
                        ) : (
                          <span className="whitespace-nowrap">{user.email}</span>
                        )}
                      </td>
                      <td className="max-w-[10rem] px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {editing && isLocal ? (
                          <input
                            value={d.department}
                            disabled={saving === user.id}
                            onChange={(e) =>
                              setDrafts((cur) => ({
                                ...cur,
                                [user.id]: { ...d, department: e.target.value },
                              }))
                            }
                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                          />
                        ) : (
                          user.department || "--"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{sourceBadge(user.provisioning_source)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {editing ? (
                          <select
                            value={d.role}
                            disabled={saving === user.id}
                            onChange={(e) => {
                              const role = e.target.value;
                              setDrafts((cur) => ({
                                ...cur,
                                [user.id]: {
                                  ...d,
                                  role,
                                  financial_view: role === "admin" ? false : d.financial_view,
                                },
                              }));
                            }}
                            className="rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm"
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm text-gray-700 dark:text-gray-200">{user.role}</span>
                        )}
                      </td>
                      <td className="max-w-[10rem] px-4 py-3">
                        {user.role === "admin" && !editing ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : editing ? (
                          d.role === "admin" ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={d.financial_view}
                                disabled={saving === user.id}
                                onChange={(e) =>
                                  setDrafts((cur) => ({
                                    ...cur,
                                    [user.id]: { ...d, financial_view: e.target.checked },
                                  }))
                                }
                                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                              />
                              <span className="text-xs text-gray-600 dark:text-gray-300">Granted</span>
                            </label>
                          )
                        ) : (
                          <Badge
                            color={
                              user.permissions?.includes(PERMISSION_FINANCIAL_VIEW)
                                ? "blue"
                                : "gray"
                            }
                          >
                            {user.permissions?.includes(PERMISSION_FINANCIAL_VIEW) ? "Yes" : "No"}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {editing ? (
                          <button
                            type="button"
                            disabled={saving === user.id}
                            onClick={() =>
                              setDrafts((cur) => ({
                                ...cur,
                                [user.id]: { ...d, is_active: !d.is_active },
                              }))
                            }
                            className="rounded-md transition-opacity disabled:opacity-50"
                          >
                            <Badge color={d.is_active ? "green" : "red"}>
                              {d.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </button>
                        ) : (
                          <Badge color={user.is_active ? "green" : "red"}>
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {editing ? (
                          <button
                            type="button"
                            disabled={saving === user.id}
                            onClick={() =>
                              setDrafts((cur) => ({
                                ...cur,
                                [user.id]: {
                                  ...d,
                                  receive_renewal_notifications: !d.receive_renewal_notifications,
                                },
                              }))
                            }
                            className="rounded-md transition-opacity disabled:opacity-50"
                          >
                            <Badge
                              color={d.receive_renewal_notifications ? "green" : "gray"}
                            >
                              {d.receive_renewal_notifications ? "On" : "Off"}
                            </Badge>
                          </button>
                        ) : (
                          <Badge
                            color={user.receive_renewal_notifications ?? true ? "green" : "gray"}
                          >
                            {user.receive_renewal_notifications ?? true ? "On" : "Off"}
                          </Badge>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${editing ? "" : "whitespace-nowrap"}`}
                      >
                        {editing ? (
                          <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                            <button
                              type="button"
                              onClick={() => saveEditing(user.id)}
                              disabled={saving === user.id}
                              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                            >
                              <CheckIcon />
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelEditing(user.id)}
                              disabled={saving === user.id}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                            >
                              <CloseIcon />
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => removeUser(user)}
                              disabled={
                                saving === user.id ||
                                deletingUserId === user.id ||
                                sameUserId(currentUser?.sub, user.id)
                              }
                              title={
                                sameUserId(currentUser?.sub, user.id)
                                  ? "You cannot delete your own account"
                                  : undefined
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <TrashIcon />
                              Delete
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEditing(user)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <PencilIcon />
                              Edit
                            </button>
                            {isLocal && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPwdModalUser(user);
                                  setPwdForm({ new_password: "", must_reset_password: false });
                                }}
                                className="text-xs font-medium text-gray-600 underline dark:text-gray-400"
                              >
                                Set password
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
    </PageTransition>
  );
}

function TrashIcon() {
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
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
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
