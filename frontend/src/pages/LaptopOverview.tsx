import { useEffect, useState, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import client from "../api/client";
import { BooleanYesNoBadge, ColoredReferenceBadge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { UserDirectoryCheckboxPicker } from "../components/UserDirectoryCheckboxPicker";
import { OsIcon } from "../components/ui/OsIcon";
import { Avatar } from "../components/ui/Avatar";
import type { LaptopDetailContext } from "../service/laptopDetailContext";
import { OS_OPTIONS, operatingSystemLabel } from "../utils/operatingSystem";
import type {
  HardwareLocation,
  HardwareStatus,
  Laptop,
  OperatingSystem,
} from "../types/models";

export type { LaptopDetailContext as LaptopDetailOutletContext } from "../service/laptopDetailContext";

function Row({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
      {error && (
        <p className="mt-1 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}

function fieldClass(hasError: boolean): string {
  return `block w-full rounded-md bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-4 transition-shadow focus:outline-none focus:ring-2 focus:ring-accent/30 ${
    hasError
      ? "border border-danger shadow-[0_0_0_3px_var(--danger-soft)]"
      : "border border-border-strong focus:border-accent"
  }`;
}

function useHardwareRefData(editing: boolean) {
  const [hardwareStatuses, setHardwareStatuses] = useState<HardwareStatus[]>(
    [],
  );
  const [hardwareLocations, setHardwareLocations] = useState<
    HardwareLocation[]
  >([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!editing) {
      setReady(false);
      return;
    }
    if (ready) return;
    let cancelled = false;
    Promise.all([
      client.get<HardwareStatus[]>("/api/hardware-statuses/"),
      client.get<HardwareLocation[]>("/api/hardware-locations/"),
    ])
      .then(([hs, hl]) => {
        if (cancelled) return;
        setHardwareStatuses(hs.data);
        setHardwareLocations(hl.data);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHardwareStatuses([]);
        setHardwareLocations([]);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, ready]);

  return { hardwareStatuses, hardwareLocations, refReady: ready };
}

function viewOperatingSystem(laptop: Laptop) {
  return (
    <span className="inline-flex items-center gap-2">
      <OsIcon operatingSystem={laptop.operating_system} className="h-5 w-5 shrink-0" />
      <span>{operatingSystemLabel(laptop.operating_system)}</span>
    </span>
  );
}

function viewStatus(laptop: Laptop) {
  return laptop.hardware_status ? (
    <ColoredReferenceBadge
      label={laptop.hardware_status.name}
      color={laptop.hardware_status.color}
    />
  ) : (
    <StatusBadge status={laptop.status} />
  );
}

function AssignedRead({ laptop }: { laptop: Laptop }) {
  if (!laptop.assigned_to) {
    return <p className="text-sm text-fg-4">Unassigned.</p>;
  }
  const u = laptop.assigned_to;
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0">
        <Avatar user={u} size={32} />
      </span>
      <div className="min-w-0">
        <Link
          to={`/users/${u.id}`}
          className="hlink text-sm font-medium text-fg"
        >
          {u.first_name} {u.last_name}
        </Link>
        <p className="mt-0.5 truncate text-xs text-fg-3">{u.email}</p>
      </div>
    </div>
  );
}

function viewLocation(laptop: Laptop) {
  return laptop.hardware_location?.name?.trim()
    ? laptop.hardware_location.name
    : "—";
}

interface RightColumnProps {
  laptop: Laptop;
  activeEdit: boolean;
  archivedEdit: boolean;
  draft: LaptopDetailContext["draft"];
  setDraftField: LaptopDetailContext["setDraftField"];
}

function RightColumn({
  laptop,
  activeEdit,
  archivedEdit,
  draft,
  setDraftField,
}: RightColumnProps) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-fg">Assigned to</h2>
        {activeEdit ? (
          <div className="min-w-0 max-w-full">
            <UserDirectoryCheckboxPicker
              variant="overview"
              maxSelections={1}
              value={draft.assigned_to_id ? [draft.assigned_to_id] : []}
              onChange={(ids) =>
                setDraftField("assigned_to_id", ids[0] ?? "")
              }
              seedUsers={laptop.assigned_to ? [laptop.assigned_to] : []}
            />
          </div>
        ) : (
          <AssignedRead laptop={laptop} />
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-fg">MDM</h2>
        <dl className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-xs font-medium uppercase tracking-wider text-fg-3">
              Connected
            </dt>
            <dd>
              {activeEdit || archivedEdit ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={draft.mdm_connected}
                    onChange={(e) =>
                      setDraftField("mdm_connected", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-border-strong accent-accent"
                  />
                  <span className="sr-only">MDM connected</span>
                </label>
              ) : (
                <BooleanYesNoBadge value={laptop.mdm_connected} />
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export function LaptopOverview() {
  const {
    laptop,
    purchaseYear,
    costAmount,
    costLoading,
    editing,
    draft,
    setDraftField,
    errors,
  } = useOutletContext<LaptopDetailContext>();

  const { hardwareStatuses, hardwareLocations, refReady } =
    useHardwareRefData(editing);

  const activeEdit = editing && laptop.is_active;
  const archivedEdit = editing && !laptop.is_active;

  useEffect(() => {
    if (!editing || !refReady || hardwareStatuses.length === 0) return;
    if (draft.hardware_status_id) return;
    const m = hardwareStatuses.find(
      (s) => s.name.toLowerCase() === draft.status.trim().toLowerCase(),
    );
    if (m) {
      setDraftField("hardware_status_id", m.id);
      setDraftField("status", m.name);
    }
  }, [editing, refReady, hardwareStatuses, draft.hardware_status_id, draft.status, setDraftField]);

  return (
    <div className="space-y-6">
      {archivedEdit && (
        <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-fg-2">
          Archived hardware supports metadata-only updates: notes, status,
          location, and MDM connected. Unarchive to change assignment, specs,
          cost, and other fields.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-fg">General</h2>
            <dl className="space-y-6">
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                <Row label="Operating system">
                  {activeEdit ? (
                    <div className="flex items-center gap-2">
                      <OsIcon
                        operatingSystem={
                          draft.operating_system
                            ? (draft.operating_system as OperatingSystem)
                            : null
                        }
                        className="h-7 w-7 shrink-0"
                      />
                      <select
                        className={`${fieldClass(false)} min-w-0 flex-1`}
                        value={draft.operating_system}
                        onChange={(e) =>
                          setDraftField("operating_system", e.target.value)
                        }
                      >
                        <option value="">— Unknown —</option>
                        {OS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    viewOperatingSystem(laptop)
                  )}
                </Row>
                <Row label="Status">
                  {activeEdit || archivedEdit ? (
                    <select
                      className={fieldClass(false)}
                      value={draft.hardware_status_id}
                      onChange={(e) => {
                        const hid = e.target.value;
                        const row = hardwareStatuses.find((s) => s.id === hid);
                        setDraftField("hardware_status_id", hid);
                        setDraftField("status", row?.name ?? draft.status);
                      }}
                      disabled={!refReady || hardwareStatuses.length === 0}
                    >
                      {!refReady || hardwareStatuses.length === 0 ? (
                        <option value="">Loading…</option>
                      ) : (
                        hardwareStatuses.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))
                      )}
                    </select>
                  ) : (
                    viewStatus(laptop)
                  )}
                </Row>
                <Row label="Location">
                  {activeEdit || archivedEdit ? (
                    <select
                      className={fieldClass(false)}
                      value={draft.hardware_location_id}
                      onChange={(e) =>
                        setDraftField("hardware_location_id", e.target.value)
                      }
                      disabled={!refReady}
                    >
                      {!refReady ? (
                        <option value="">Loading…</option>
                      ) : (
                        <>
                          <option value="">— None —</option>
                          {hardwareLocations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  ) : (
                    viewLocation(laptop)
                  )}
                </Row>
              </div>

              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                <Row label="CPU">
                  {activeEdit ? (
                    <input
                      className={fieldClass(false)}
                      value={draft.cpu}
                      onChange={(e) => setDraftField("cpu", e.target.value)}
                    />
                  ) : (
                    laptop.cpu || "—"
                  )}
                </Row>
                <Row label="RAM">
                  {activeEdit ? (
                    <input
                      className={fieldClass(false)}
                      value={draft.ram}
                      onChange={(e) => setDraftField("ram", e.target.value)}
                    />
                  ) : (
                    laptop.ram || "—"
                  )}
                </Row>
                <Row label="Storage">
                  {activeEdit ? (
                    <input
                      className={fieldClass(false)}
                      value={draft.storage_size}
                      onChange={(e) =>
                        setDraftField("storage_size", e.target.value)
                      }
                    />
                  ) : (
                    laptop.storage_size || "—"
                  )}
                </Row>
              </div>

              {costLoading && !activeEdit ? (
                <div className="text-sm text-fg-3">
                  Loading purchase &amp; cost…
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                  <Row label="Purchase year" error={errors.purchase_year}>
                    {activeEdit ? (
                      <input
                        type="number"
                        min={1900}
                        max={2100}
                        className={fieldClass(Boolean(errors.purchase_year))}
                        value={draft.purchase_year}
                        onChange={(e) =>
                          setDraftField("purchase_year", e.target.value)
                        }
                        placeholder="Optional"
                      />
                    ) : purchaseYear.trim() ? (
                      purchaseYear
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Cost" error={errors.purchase_cost}>
                    {activeEdit ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={fieldClass(Boolean(errors.purchase_cost))}
                        value={draft.purchase_cost}
                        onChange={(e) =>
                          setDraftField("purchase_cost", e.target.value)
                        }
                        placeholder="Optional"
                      />
                    ) : costAmount.trim() ? (
                      `$${Number(costAmount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    ) : (
                      "—"
                    )}
                  </Row>
                </div>
              )}
            </dl>
          </section>

          {editing && (
            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-fg">Notes</h2>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraftField("notes", e.target.value)}
                className={`${fieldClass(false)} max-h-28 min-h-[4.5rem] resize-y text-sm`}
                placeholder="Internal notes about this device…"
              />
            </section>
          )}
        </div>

        <div className="lg:col-span-1">
          <RightColumn
            laptop={laptop}
            activeEdit={activeEdit}
            archivedEdit={archivedEdit}
            draft={draft}
            setDraftField={setDraftField}
          />
        </div>
      </div>

      {!editing && (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-fg">Notes</h2>
          {laptop.notes?.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-fg">{laptop.notes}</p>
          ) : (
            <p className="text-sm text-fg-4">No notes yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
