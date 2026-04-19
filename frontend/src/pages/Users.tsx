import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { Badge } from "../components/Badge";
import { PageTransition } from "../components/PageTransition";
import { SearchInput } from "../components/SearchInput";
import { useToast } from "../context/useToast";
import { PERMISSION_FINANCIAL_VIEW } from "../constants/permissions";
import type { ProvisioningSource, User } from "../types/models";

const ROLES = ["admin", "editor", "viewer"] as const;

function formatApiError(err: unknown): string {
  const ax = err as {
    response?: { data?: { detail?: string | { message?: string } } };
  };
  const d = ax.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  return "Request failed.";
}

function sourceBadge(src: ProvisioningSource) {
  if (src === "local") return <Badge color="gray">Manual</Badge>;
  if (src === "scim") return <Badge color="blue">SCIM</Badge>;
  return <Badge color="purple">OIDC</Badge>;
}

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
                {filtered.map((user) => {
                  const financialView =
                    user.permissions?.includes(PERMISSION_FINANCIAL_VIEW) ?? false;
                  return (
                    <tr key={user.id}>
                      <td className="max-w-[14rem] px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <Link
                          to={`/users/${user.id}`}
                          className="hlink whitespace-nowrap"
                        >
                          {user.first_name} {user.last_name}
                        </Link>
                      </td>
                      <td className="max-w-[12rem] px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        <span className="whitespace-nowrap">{user.email}</span>
                      </td>
                      <td className="max-w-[10rem] px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {user.department || "--"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{sourceBadge(user.provisioning_source)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-200">{user.role}</span>
                      </td>
                      <td className="max-w-[10rem] px-4 py-3">
                        {user.role === "admin" ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <Badge color={financialView ? "blue" : "gray"}>
                            {financialView ? "Yes" : "No"}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge color={user.is_active ? "green" : "red"}>
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge
                          color={user.receive_renewal_notifications ?? true ? "green" : "gray"}
                        >
                          {user.receive_renewal_notifications ?? true ? "On" : "Off"}
                        </Badge>
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
