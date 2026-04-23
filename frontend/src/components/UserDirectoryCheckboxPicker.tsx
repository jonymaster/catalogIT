import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import client from "../api/client";
import { SearchInput } from "./SearchInput";
import { Avatar, AvatarStack } from "./ui/Avatar";
import type { User, UserDirectoryPage } from "../types/models";

const DEFAULT_PAGE_SIZE = 25;
const EMPTY_SEED_USERS: User[] = [];

export interface UserDirectoryCheckboxPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  seedUsers?: User[];
  pageSize?: number;
  /** Overview tab uses design tokens; create form uses gray borders. */
  variant?: "overview" | "form";
  /**
   * When `1`, only one user can be selected (radio list + Unassigned).
   * Same search and paging as multi-select.
   */
  maxSelections?: number;
}

export function UserDirectoryCheckboxPicker({
  value,
  onChange,
  seedUsers = EMPTY_SEED_USERS,
  pageSize = DEFAULT_PAGE_SIZE,
  variant = "form",
  maxSelections,
}: UserDirectoryCheckboxPickerProps) {
  const radioGroupName = useId();
  const single = maxSelections === 1;
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [directoryPage, setDirectoryPage] = useState<UserDirectoryPage | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [userCache, setUserCache] = useState<Map<string, User>>(() => new Map());

  useEffect(() => {
    setUserCache((prev) => {
      const next = new Map(prev);
      for (const u of seedUsers) next.set(u.id, u);
      return next;
    });
  }, [seedUsers]);

  const loadPage = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      try {
        const r = await client.get<UserDirectoryPage>("/api/users/page", {
          params: {
            page: p,
            per_page: pageSize,
            q: q.trim() || undefined,
          },
        });
        setDirectoryPage(r.data);
        setUserCache((prev) => {
          const next = new Map(prev);
          for (const u of r.data.items) next.set(u.id, u);
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void loadPage(page, searchQuery);
  }, [page, searchQuery, loadPage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === searchQuery) return;
      setPage(1);
      setDirectoryPage(null);
      setSearchQuery(next);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput, searchQuery]);

  const selectedUsersOrdered = useMemo(() => {
    return value
      .map((id) => userCache.get(id))
      .filter((u): u is User => u != null);
  }, [value, userCache]);

  function toggle(id: string) {
    if (single) {
      onChange([id]);
      return;
    }
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
    } else {
      const next = [...value, id];
      if (maxSelections != null && next.length > maxSelections) {
        return;
      }
      onChange(next);
    }
  }

  const selectedId = single ? (value[0] ?? "") : "";

  const total = directoryPage?.total ?? 0;
  const totalPages = directoryPage?.total_pages ?? 1;
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx =
    total === 0 ? 0 : Math.min(page * pageSize, total);

  const overviewSearch = (
    <div className="rounded-md border border-border-strong bg-surface">
      <SearchInput
        bare
        value={searchInput}
        onChange={setSearchInput}
        placeholder="Search users…"
        containerClassName="w-full"
        inputClassName="py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-4"
        iconClassName="text-fg-4"
      />
    </div>
  );

  const formSearch = (
    <SearchInput
      value={searchInput}
      onChange={setSearchInput}
      placeholder="Search users…"
      containerClassName="w-full"
      inputClassName="py-1.5 text-sm"
    />
  );

  const listShell =
    variant === "overview"
      ? "max-h-48 overflow-y-auto rounded-md border border-border-strong bg-surface"
      : "max-h-48 overflow-y-auto rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950";

  const rowText = variant === "overview" ? "text-fg" : "text-gray-900 dark:text-gray-100";
  const mutedText =
    variant === "overview" ? "text-fg-3" : "text-gray-500 dark:text-gray-400";
  const rowHover =
    variant === "overview"
      ? "hover:bg-surface-2/80 dark:hover:bg-gray-900/80"
      : "hover:bg-gray-50 dark:hover:bg-gray-900/80";
  const listDivide =
    variant === "overview"
      ? "divide-border/60 dark:divide-gray-800"
      : "divide-gray-200 dark:divide-gray-700";
  const checkboxCls =
    "h-4 w-4 shrink-0 rounded border-gray-300 dark:border-gray-600 accent-brand-600";
  const radioCls =
    "h-4 w-4 shrink-0 border-gray-300 dark:border-gray-600 accent-brand-600";
  const pageBtnCls =
    variant === "overview"
      ? "rounded border border-border px-2 py-0.5 text-fg hover:bg-surface-2 disabled:opacity-40 dark:border-gray-600"
      : "rounded border border-gray-300 px-2 py-0.5 text-gray-800 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800";

  return (
    <div className="space-y-2">
      {selectedUsersOrdered.length > 0 && (
        <AvatarStack users={selectedUsersOrdered} max={5} size={22} />
      )}

      {variant === "overview" ? overviewSearch : formSearch}

      <div className={listShell}>
        {loading && !directoryPage ? (
          <p className={`px-3 py-4 text-sm ${mutedText}`}>Loading users…</p>
        ) : single && directoryPage ? (
          <ul className={`divide-y ${listDivide}`}>
            <li key="__unassigned__">
              <label
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 ${rowHover} ${rowText}`}
              >
                <input
                  type="radio"
                  name={radioGroupName}
                  checked={value.length === 0}
                  onChange={() => onChange([])}
                  disabled={loading}
                  className={radioCls}
                />
                <span className="text-sm font-medium">Unassigned</span>
              </label>
            </li>
            {directoryPage.items.map((u) => {
              const checked = selectedId === u.id;
              return (
                <li key={u.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 ${rowHover} ${rowText}`}
                  >
                    <input
                      type="radio"
                      name={radioGroupName}
                      checked={checked}
                      onChange={() => toggle(u.id)}
                      disabled={loading}
                      className={radioCls}
                    />
                    <Avatar user={u} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {u.first_name} {u.last_name}
                      </span>
                      <span className={`block truncate text-xs ${mutedText}`}>
                        {u.email}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {directoryPage.items.length === 0 && searchQuery.trim() !== "" && (
              <li className={`px-3 py-3 text-sm ${mutedText}`}>
                No users match your search.
              </li>
            )}
            {directoryPage.items.length === 0 && searchQuery.trim() === "" && (
              <li className={`px-3 py-3 text-sm ${mutedText}`}>
                No other users in the directory.
              </li>
            )}
          </ul>
        ) : directoryPage && directoryPage.items.length === 0 ? (
          <p className={`px-3 py-4 text-sm ${mutedText}`}>
            {searchQuery.trim()
              ? "No users match your search."
              : "No users in the directory."}
          </p>
        ) : (
          <ul className={`divide-y ${listDivide}`}>
            {directoryPage?.items.map((u) => {
              const checked = value.includes(u.id);
              return (
                <li key={u.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 ${rowHover} ${rowText}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(u.id)}
                      disabled={loading}
                      className={checkboxCls}
                    />
                    <Avatar user={u} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {u.first_name} {u.last_name}
                      </span>
                      <span className={`block truncate text-xs ${mutedText}`}>
                        {u.email}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {directoryPage && total > 0 && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 text-xs ${
            variant === "overview" ? "text-fg-3" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <span>
            {startIdx}–{endIdx} of {total}
          </span>
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={pageBtnCls}
            >
              Previous
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={pageBtnCls}
            >
              Next
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
