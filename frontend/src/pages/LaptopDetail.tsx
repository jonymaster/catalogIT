import {
  useCallback,
  useEffect,
  type ReactNode,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import client from "../api/client";
import { AuditTimeline } from "../components/AuditTimeline";
import { PageTransition } from "../components/PageTransition";
import { DetailPageSkeleton } from "../components/Skeleton";
import {
  ChevronRightIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "../components/Icons";
import { useAuth } from "../context/useAuth";
import {
  draftFromLaptopAndCostStrings,
  draftToArchivedLaptopPayload,
  draftToLaptopPayload,
  mergeCostIntoDraft,
  toDraft,
  validateDraft,
  type LaptopDetailContext,
  type LaptopDraft,
  type LaptopValidationErrors,
} from "../service/laptopDetailContext";
import type { CostRecord, Laptop } from "../types/models";

export function LaptopDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { canEdit, canFinancialView, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [laptop, setLaptop] = useState<Laptop | null>(null);
  const [draft, setDraft] = useState<LaptopDraft | null>(null);
  const [editing, setEditingState] = useState(false);
  const [errors, setErrors] = useState<LaptopValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<
    "archive" | "unarchive" | "delete" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [costLoading, setCostLoading] = useState(true);
  const [purchaseYear, setPurchaseYear] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [extraTab, setExtraTab] = useState<"activity" | null>(null);

  const openEditConsumed = useRef(false);

  const pathname = location.pathname;
  const lastPathRef = useRef(pathname);
  if (lastPathRef.current !== pathname) {
    lastPathRef.current = pathname;
    if (editing) setEditingState(false);
  }

  useEffect(() => {
    openEditConsumed.current = false;
  }, [id]);

  useEffect(() => {
    if (openEditConsumed.current) return;
    const st = location.state as { openEdit?: boolean } | null;
    if (st?.openEdit) {
      openEditConsumed.current = true;
      navigate(location.pathname, { replace: true, state: null });
      if (canEdit) setEditingState(true);
    }
  }, [location.state, location.pathname, canEdit, navigate]);

  useEffect(() => {
    if (!id) {
      setLaptop(null);
      setDraft(null);
      setLoading(false);
      setCostLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setCostLoading(true);
    Promise.all([
      client.get<Laptop>(`/api/laptops/${id}`),
      canFinancialView
        ? client.get<CostRecord | null>(`/api/laptops/${id}/hardware-cost`)
        : Promise.resolve({ data: null as CostRecord | null }),
    ])
      .then(([lapRes, costRes]) => {
        if (cancelled) return;
        setLaptop(lapRes.data);
        const c = costRes.data;
        if (c) {
          setPurchaseYear(
            c.purchase_year != null ? String(c.purchase_year) : "",
          );
          setCostAmount(String(c.amount));
          setDraft(mergeCostIntoDraft(toDraft(lapRes.data), c));
        } else {
          setPurchaseYear("");
          setCostAmount("");
          setDraft(mergeCostIntoDraft(toDraft(lapRes.data), null));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLaptop(null);
        setDraft(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setCostLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, canFinancialView]);

  const reloadAll = useCallback(async () => {
    if (!id) return;
    const [lapRes, costRes] = await Promise.all([
      client.get<Laptop>(`/api/laptops/${id}`),
      canFinancialView
        ? client.get<CostRecord | null>(`/api/laptops/${id}/hardware-cost`)
        : Promise.resolve({ data: null as CostRecord | null }),
    ]);
    setLaptop(lapRes.data);
    const c = costRes.data;
    if (c) {
      setPurchaseYear(c.purchase_year != null ? String(c.purchase_year) : "");
      setCostAmount(String(c.amount));
      setDraft(mergeCostIntoDraft(toDraft(lapRes.data), c));
    } else {
      setPurchaseYear("");
      setCostAmount("");
      setDraft(mergeCostIntoDraft(toDraft(lapRes.data), null));
    }
  }, [id, canFinancialView]);

  const setDraftField = useCallback(
    <K extends keyof LaptopDraft>(key: K, value: LaptopDraft[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const setEditing = useCallback(
    (next: boolean) => {
      setEditingState(next);
      setSaveError(null);
      setErrors({});
      if (!next && laptop) {
        setDraft(draftFromLaptopAndCostStrings(laptop, purchaseYear, costAmount));
      }
    },
    [laptop, purchaseYear, costAmount],
  );

  async function handleSave() {
    if (!laptop || !draft || !id) return;
    const validationErrors = validateDraft(draft, laptop.is_active);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (laptop.is_active) {
        await client.put<Laptop>(`/api/laptops/${id}`, draftToLaptopPayload(draft));
        if (canFinancialView) {
          const pyRaw = draft.purchase_year.trim();
          const py = pyRaw ? Number(pyRaw) : null;
          const costRaw = draft.purchase_cost.trim();
          const costAmt = costRaw ? Number(costRaw) : 0;
          await client.put(`/api/laptops/${id}/hardware-cost`, {
            amount: Number.isFinite(costAmt) && costAmt >= 0 ? costAmt : 0,
            purchase_year: py != null && Number.isFinite(py) ? py : null,
          });
        }
      } else {
        await client.put<Laptop>(
          `/api/laptops/${id}`,
          draftToArchivedLaptopPayload(draft),
        );
      }
      await reloadAll();
      setEditingState(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save laptop";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  function getActionErrorMessage(err: unknown): string {
    const detail = (err as { response?: { data?: { detail?: string } } })
      ?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return "Action failed. Please try again.";
  }

  async function handleArchive() {
    if (!id || !laptop) return;
    const confirmed = window.confirm(
      `Archive "${laptop.model_name}"? It will move to Archived hardware.`,
    );
    if (!confirmed) return;
    setActionBusy("archive");
    setActionError(null);
    try {
      await client.post<Laptop>(`/api/laptops/${id}/archive`);
      await reloadAll();
      setEditingState(false);
    } catch (err: unknown) {
      setActionError(getActionErrorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleUnarchive() {
    if (!id || !laptop) return;
    const confirmed = window.confirm(
      `Unarchive "${laptop.model_name}"? It will return to Active hardware.`,
    );
    if (!confirmed) return;
    setActionBusy("unarchive");
    setActionError(null);
    try {
      await client.post<Laptop>(`/api/laptops/${id}/unarchive`);
      await reloadAll();
      setEditingState(false);
    } catch (err: unknown) {
      setActionError(getActionErrorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDelete() {
    if (!id || !laptop) return;
    const confirmed = window.confirm(
      `Delete "${laptop.model_name}" permanently? This cannot be undone.`,
    );
    if (!confirmed) return;
    setActionBusy("delete");
    setActionError(null);
    try {
      await client.delete(`/api/laptops/${id}`);
      navigate("/hardware");
    } catch (err: unknown) {
      setActionError(getActionErrorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }

  const isIndexRoute =
    id != null &&
    (location.pathname === `/hardware/${id}` ||
      location.pathname === `/hardware/${id}/`);

  useEffect(() => {
    if (!isIndexRoute) setExtraTab(null);
  }, [isIndexRoute]);

  if (loading) return <DetailPageSkeleton />;
  if (!laptop || !draft)
    return <p className="text-sm text-red-600">Laptop not found.</p>;

  const outletContext: LaptopDetailContext = {
    laptop,
    reloadLaptop: reloadAll,
    purchaseYear,
    costAmount,
    costLoading,
    canFinancialView,
    editing,
    setEditing,
    draft,
    setDraftField,
    errors,
    saving,
    saveError,
  };

  /** Model on first line, S/N on second — read and edit share the same stack. */
  const headerTitleStackCls =
    "mt-2 flex w-full min-w-0 flex-col gap-1";
  const headerModelReadCls =
    "block min-w-0 w-full max-w-full break-words text-2xl font-semibold leading-tight tracking-[-0.02em] text-gray-900 dark:text-gray-100";
  const headerModelEditCls =
    "box-border max-w-full border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus-visible:rounded-sm focus-visible:bg-white focus-visible:shadow-[inset_0_0_0_1px_theme(colors.gray.300)] dark:text-gray-100 dark:focus-visible:bg-gray-950 dark:focus-visible:shadow-[inset_0_0_0_1px_theme(colors.gray.600)]";
  /** Second line under the title; same typography in read + edit. */
  const headerSerialReadCls =
    "m-0 min-w-0 w-full max-w-full text-sm tabular-nums leading-tight text-gray-500 dark:text-gray-400";
  /** No `w-full` — that forces a line break after the `S/N:` label in a flex row. */
  const headerSerialEditCls =
    "min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm tabular-nums leading-tight text-gray-500 outline-none focus-visible:rounded-sm focus-visible:shadow-[inset_0_0_0_1px_theme(colors.blue.500)] dark:text-gray-400";
  const displayName = editing ? draft.model_name : laptop.model_name;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-1.5 text-xs text-fg-3">
          <Link to="/hardware" className="hlink">
            Hardware
          </Link>
          <ChevronRightIcon className="h-3 w-3" />
          <span className="text-fg-2">{displayName}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editing && laptop.is_active ? (
              <>
                <div className={headerTitleStackCls}>
                  <input
                    id="laptop-header-model"
                    type="text"
                    name="model_name"
                    aria-label="Model name"
                    autoComplete="off"
                    value={draft.model_name}
                    onChange={(e) =>
                      setDraftField("model_name", e.target.value)
                    }
                    className={`${headerModelReadCls} ${headerModelEditCls}`}
                    aria-invalid={!!errors.model_name}
                  />
                  <p
                    className={`${headerSerialReadCls} flex flex-nowrap items-baseline gap-x-1`}
                  >
                    <span className="shrink-0">S/N: </span>
                    <input
                      id="laptop-header-serial"
                      type="text"
                      name="serial_number"
                      aria-label="Serial number"
                      autoComplete="off"
                      value={draft.serial_number}
                      onChange={(e) =>
                        setDraftField("serial_number", e.target.value)
                      }
                      className={headerSerialEditCls}
                      aria-invalid={!!errors.serial_number}
                    />
                  </p>
                </div>
                {(errors.model_name || errors.serial_number) && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {errors.model_name && (
                      <p className="text-xs text-red-600">{errors.model_name}</p>
                    )}
                    {errors.serial_number && (
                      <p className="text-xs text-red-600">
                        {errors.serial_number}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className={headerTitleStackCls}>
                <h1 className={headerModelReadCls}>{laptop.model_name}</h1>
                <p className={headerSerialReadCls}>
                  S/N: {laptop.serial_number}
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-150 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit
              </button>
            )}
            {!editing && (
              <KebabMenu
                canEdit={canEdit}
                canDelete={isAdmin}
                isArchived={!laptop.is_active}
                busyAction={actionBusy}
                onArchive={() => {
                  void handleArchive();
                }}
                onUnarchive={() => {
                  void handleUnarchive();
                }}
                onDelete={() => {
                  void handleDelete();
                }}
              />
            )}
            {canEdit && editing && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void handleSave();
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        </div>

        {saveError && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {saveError}
          </div>
        )}
        {actionError && !editing && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {actionError}
          </div>
        )}

        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                setExtraTab(null);
                navigate(`/hardware/${id}`);
              }}
              className={`inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
                isIndexRoute && extraTab === null
                  ? "border-blue-600 text-gray-900 dark:border-blue-400 dark:text-gray-100"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              }`}
            >
              Overview
            </button>
            <NavLink
              to={`/hardware/${id}/attachments`}
              onClick={() => setExtraTab(null)}
              className={({ isActive }) =>
                `inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-blue-600 text-gray-900 dark:border-blue-400 dark:text-gray-100"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
                }`
              }
            >
              Attachments
            </NavLink>
            <button
              type="button"
              onClick={() => {
                if (!isIndexRoute) navigate(`/hardware/${id}`);
                setExtraTab("activity");
              }}
              className={`inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
                isIndexRoute && extraTab === "activity"
                  ? "border-blue-600 text-gray-900 dark:border-blue-400 dark:text-gray-100"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              }`}
            >
              Activity
            </button>
          </nav>
        </div>

        {extraTab === "activity" ? (
          <Panel title="Activity">
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Recent changes to this laptop.
            </p>
            <AuditTimeline tableName="laptops" recordId={laptop.id} perPage={20} />
          </Panel>
        ) : (
          <Outlet context={outletContext} />
        )}
      </div>
    </PageTransition>
  );
}

interface KebabMenuProps {
  canEdit: boolean;
  canDelete: boolean;
  isArchived: boolean;
  busyAction: "archive" | "unarchive" | "delete" | null;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}

function KebabMenu({
  canEdit,
  canDelete,
  isArchived,
  busyAction,
  onArchive,
  onUnarchive,
  onDelete,
}: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const isBusy = busyAction !== null;

  function runAndClose(action: () => void) {
    action();
    setOpen(false);
  }

  const archiveLabel = isArchived ? "Unarchive" : "Archive";
  const archiveBusy = busyAction === "archive" || busyAction === "unarchive";
  const deleteDisabled = !isArchived || !canDelete || isBusy;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isBusy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-fg-2 transition-colors hover:bg-surface-2"
      >
        <span className="sr-only">More actions</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-md"
          >
            <MenuItem label="Duplicate" onClick={() => setOpen(false)} />
            {canEdit && (
              <MenuItem
                label={archiveBusy ? `${archiveLabel}...` : archiveLabel}
                disabled={isBusy}
                onClick={() =>
                  runAndClose(isArchived ? onUnarchive : onArchive)
                }
              />
            )}
            <MenuItem
              label="Delete"
              variant="danger"
              disabled={deleteDisabled}
              title={
                !isArchived
                  ? "Archive hardware before deleting"
                  : !canDelete
                    ? "Only admins can delete hardware"
                    : undefined
              }
              onClick={() => runAndClose(onDelete)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  variant,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  variant?: "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "danger" ? "text-danger" : "text-fg-2"
      }`}
    >
      {label}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h2>
      {children}
    </div>
  );
}
