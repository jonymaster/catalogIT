import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import type { Service, UserDirectoryPage } from "../types/models";

const DIRECTORY_PAGE_SIZE = 25;

function idsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((id, i) => id === sb[i]);
}

export function ServiceAssignments() {
  const { service, reloadService } = useOutletContext<{
    service: Service;
    reloadService: () => void;
  }>();
  const { canEdit } = useAuth();
  const { showToast } = useToast();

  const [manageOpen, setManageOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [directoryPage, setDirectoryPage] = useState<UserDirectoryPage | null>(
    null,
  );
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  /** Working selection while modal is open (all assignees across pages). */
  const [draftAssignedIds, setDraftAssignedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [saving, setSaving] = useState(false);
  const [selectingAllUsers, setSelectingAllUsers] = useState(false);
  const [allUsersSelected, setAllUsersSelected] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadDirectoryPage = useCallback(async (p: number, query: string) => {
    setDirectoryLoading(true);
    try {
      const r = await client.get<UserDirectoryPage>("/api/users/page", {
        params: {
          page: p,
          per_page: DIRECTORY_PAGE_SIZE,
          q: query || undefined,
        },
      });
      setDirectoryPage(r.data);
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!manageOpen) return;
    void loadDirectoryPage(page, searchQuery);
  }, [manageOpen, page, searchQuery, loadDirectoryPage]);

  useEffect(() => {
    if (!manageOpen) return;
    const timeout = window.setTimeout(() => {
      const nextQuery = searchInput.trim();
      if (nextQuery === searchQuery) return;
      setPage(1);
      setDirectoryPage(null);
      setSearchQuery(nextQuery);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput, searchQuery, manageOpen]);

  const pageUserIds = directoryPage?.items.map((u) => u.id) ?? [];
  const allOnPageSelected =
    pageUserIds.length > 0 && pageUserIds.every((id) => draftAssignedIds.has(id));
  const someOnPageSelected = pageUserIds.some((id) =>
    draftAssignedIds.has(id),
  );

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someOnPageSelected && !allOnPageSelected;
  }, [someOnPageSelected, allOnPageSelected]);

  const atCapacity =
    service.total_seats != null &&
    service.assignees.length >= service.total_seats;

  async function saveAssignments(ids: string[]) {
    setSaving(true);
    try {
      await client.put(`/api/services/${service.id}`, { assignee_ids: ids });
      reloadService();
      setManageOpen(false);
    } catch (err: unknown) {
      let msg = "Failed to update assignments";
      if (axios.isAxiosError(err)) {
        const d = err.response?.data;
        if (d && typeof d === "object" && "detail" in d) {
          msg = String((d as { detail: unknown }).detail);
        } else if (err.message) {
          msg = err.message;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      showToast({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  }

  function toggleUser(id: string) {
    setAllUsersSelected(false);
    setDraftAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (
          service.total_seats != null &&
          next.size >= service.total_seats
        ) {
          showToast({
            type: "error",
            text: `Cannot assign more than ${service.total_seats} seat(s) for this service.`,
          });
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setAllUsersSelected(false);
    setDraftAssignedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pageUserIds.forEach((id) => next.delete(id));
        return next;
      }
      const cap = service.total_seats;
      if (cap != null) {
        const wouldAdd = pageUserIds.filter((id) => !next.has(id));
        const room = cap - next.size;
        if (wouldAdd.length > room) {
          showToast({
            type: "error",
            text: `You can only assign up to ${cap} seat(s). Uncheck some users first or raise capacity on the service edit form.`,
          });
          return prev;
        }
      }
      pageUserIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function userMatchesSearch(
    user: { first_name: string; last_name: string; email: string },
    query: string,
  ) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${user.first_name} ${user.last_name} ${user.email}`
      .toLowerCase()
      .includes(q);
  }

  async function selectAllUsersAcrossPages() {
    setSelectingAllUsers(true);
    try {
      let currentPage = 1;
      let totalPages = 1;
      const allIds = new Set<string>();
      do {
        const r = await client.get<UserDirectoryPage>("/api/users/page", {
          params: {
            page: currentPage,
            per_page: DIRECTORY_PAGE_SIZE,
            q: searchQuery || undefined,
          },
        });
        totalPages = r.data.total_pages;
        for (const u of r.data.items) {
          if (userMatchesSearch(u, searchQuery)) allIds.add(u.id);
        }
        currentPage += 1;
      } while (currentPage <= totalPages);

      const cap = service.total_seats;
      if (cap != null && allIds.size > cap) {
        showToast({
          type: "error",
          text: `You can only assign up to ${cap} seat(s). Refine search or raise capacity on the service edit form.`,
        });
        return;
      }

      setDraftAssignedIds(allIds);
      setAllUsersSelected(true);
    } catch (err: unknown) {
      let msg = "Failed to select all users";
      if (axios.isAxiosError(err) && err.message) msg = err.message;
      else if (err instanceof Error) msg = err.message;
      showToast({ type: "error", text: msg });
    } finally {
      setSelectingAllUsers(false);
    }
  }

  function handleSaveModal() {
    const ids = Array.from(draftAssignedIds).sort();
    void saveAssignments(ids);
  }

  const draftSorted = Array.from(draftAssignedIds).sort();
  const savedSorted = service.assignees.map((a) => a.id).sort();
  const modalDirty = !idsEqual(draftSorted, savedSorted);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Assign users who consume a seat for this service. This is separate from
        service owners (accountable contacts). Edit total seat capacity on the
        service edit form.
      </p>

      {service.total_seats != null && (
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Capacity: {service.assignees.length} / {service.total_seats} assignees
          {atCapacity && (
            <span className="ml-2 text-amber-700 dark:text-amber-400">
              (at capacity)
            </span>
          )}
        </p>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Assigned users
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setDraftAssignedIds(
                  new Set(service.assignees.map((a) => a.id)),
                );
                setPage(1);
                setSearchInput("");
                setSearchQuery("");
                setAllUsersSelected(false);
                setDirectoryPage(null);
                setManageOpen(true);
              }}
              disabled={saving}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Manage user assignment
            </button>
          )}
        </div>
        {service.assignees.length === 0 ? (
          <p className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
            No users assigned yet.
            {canEdit && (
              <span className="block mt-2 text-gray-600 dark:text-gray-300">
                Use &quot;Manage user assignment&quot; to choose users.
              </span>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {service.assignees
              .slice()
              .sort((a, b) => a.email.localeCompare(b.email))
              .map((u) => (
                <li key={u.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {u.email}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </div>

      {manageOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-assignments-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Close"
              onClick={() => !saving && setManageOpen(false)}
            />
            <div className="relative z-10 flex h-[min(90vh,900px)] w-full max-w-5xl flex-col self-center rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
              <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                <h2
                  id="manage-assignments-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Manage user assignment
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Select users assigned to this service. At most{" "}
                  {DIRECTORY_PAGE_SIZE} users per page.
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search users by name or email"
                    disabled={saving || selectingAllUsers}
                    className="w-full max-w-sm rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    aria-label="Search users"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (allUsersSelected) {
                        setDraftAssignedIds(new Set());
                        setAllUsersSelected(false);
                        return;
                      }
                      void selectAllUsersAcrossPages();
                    }}
                    disabled={saving || selectingAllUsers || directoryLoading}
                    className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {selectingAllUsers
                      ? "Selecting users…"
                      : allUsersSelected
                        ? "Unselect all users"
                        : "Select all users"}
                  </button>
                </div>
                {directoryLoading && !directoryPage ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Loading users…
                  </p>
                ) : directoryPage && directoryPage.items.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No users in the directory.
                  </p>
                ) : directoryPage ? (
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="w-10 py-2 pr-2">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                            checked={allOnPageSelected}
                            onChange={toggleSelectAllOnPage}
                            disabled={saving}
                            title="Select all on this page"
                            aria-label="Select all users on this page"
                          />
                        </th>
                        <th className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">
                          Name
                        </th>
                        <th className="py-2 font-medium text-gray-900 dark:text-gray-100">
                          Email
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {directoryPage.items.map((u) => (
                        <tr
                          key={u.id}
                          className="border-b border-gray-100 dark:border-gray-800"
                        >
                          <td className="py-2 pr-2 align-top">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                              checked={draftAssignedIds.has(u.id)}
                              onChange={() => toggleUser(u.id)}
                              disabled={saving}
                              aria-label={`Assign ${u.email}`}
                            />
                          </td>
                          <td className="py-2 pr-4 align-top text-gray-900 dark:text-gray-100">
                            {u.first_name} {u.last_name}
                          </td>
                          <td className="py-2 align-top text-gray-600 dark:text-gray-300">
                            {u.email}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>

              {directoryPage && directoryPage.total_pages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  <span>
                    Page {directoryPage.page} of {directoryPage.total_pages} (
                    {directoryPage.total} users)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving || page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={
                        saving || page >= (directoryPage?.total_pages ?? 1)
                      }
                      onClick={() =>
                        setPage((p) =>
                          Math.min(
                            directoryPage?.total_pages ?? 1,
                            p + 1,
                          ),
                        )
                      }
                      className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setManageOpen(false)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || !modalDirty}
                  onClick={handleSaveModal}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
