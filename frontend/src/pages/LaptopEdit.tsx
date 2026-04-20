import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { LaptopForm } from "../components/LaptopForm";
import { PageTransition } from "../components/PageTransition";
import { FormSkeleton } from "../components/Skeleton";
import { LAPTOP_FIELD_LABELS } from "../hardware/laptopViewLayout";
import type { HardwareLocation, HardwareStatus, Laptop } from "../types/models";

export function LaptopEdit() {
  const { id } = useParams<{ id: string }>();
  const [laptop, setLaptop] = useState<Laptop | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [hardwareStatusId, setHardwareStatusId] = useState("");
  const [hardwareLocationId, setHardwareLocationId] = useState("");
  const [hardwareStatuses, setHardwareStatuses] = useState<HardwareStatus[]>([]);
  const [hardwareLocations, setHardwareLocations] = useState<HardwareLocation[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client
      .get<HardwareStatus[]>("/api/hardware-statuses/")
      .then((r) => setHardwareStatuses(r.data))
      .catch(() => setHardwareStatuses([]));
    client
      .get<HardwareLocation[]>("/api/hardware-locations/")
      .then((r) => setHardwareLocations(r.data))
      .catch(() => setHardwareLocations([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    client
      .get<Laptop>(`/api/laptops/${id}`)
      .then((r) => {
        const d = r.data;
        setLaptop(d);
        setNotes(d.notes ?? "");
        setHardwareStatusId(d.hardware_status_id ?? "");
        setHardwareLocationId(d.hardware_location_id ?? "");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!laptop || hardwareStatuses.length === 0) return;
    if (hardwareStatusId) return;
    const m = hardwareStatuses.find(
      (s) => s.name.toLowerCase() === laptop.status.trim().toLowerCase(),
    );
    if (m) setHardwareStatusId(m.id);
  }, [laptop, hardwareStatuses, hardwareStatusId]);

  async function saveArchivedMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !laptop) return;
    setSaving(true);
    try {
      const row = hardwareStatuses.find((s) => s.id === hardwareStatusId);
      const response = await client.put<Laptop>(`/api/laptops/${id}`, {
        notes: notes.trim() || null,
        hardware_status_id: hardwareStatusId || null,
        hardware_location_id: hardwareLocationId || null,
        status: row?.name ?? laptop.status,
      });
      setLaptop(response.data);
      setNotes(response.data.notes ?? "");
      setHardwareStatusId(response.data.hardware_status_id ?? "");
      setHardwareLocationId(response.data.hardware_location_id ?? "");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!id || !laptop) return;
    const endpoint = laptop.is_active
      ? `/api/laptops/${id}/archive`
      : `/api/laptops/${id}/unarchive`;
    const response = await client.post<Laptop>(endpoint);
    setLaptop(response.data);
    setNotes(response.data.notes ?? "");
    setHardwareStatusId(response.data.hardware_status_id ?? "");
    setHardwareLocationId(response.data.hardware_location_id ?? "");
  }

  if (loading) return <FormSkeleton />;
  if (!laptop)
    return <p className="text-sm text-red-600">Laptop not found.</p>;

  const inputCls =
    "block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1";
  const readOnlyCls = "mt-1 text-sm text-gray-900 dark:text-gray-100";
  const rowGridCls = "grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3";
  const sectionCardCls =
    "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm";

  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <Link
          to={`/hardware/${id}`}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          &larr; Back to {laptop.model_name}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {laptop.model_name}
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            Editing
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          S/N: {laptop.serial_number}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleArchiveToggle}
            className={
              laptop.is_active
                ? "rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                : "rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            }
          >
            {laptop.is_active ? "Archive" : "Unarchive"}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-brand-500 bg-white dark:bg-gray-900 p-6 shadow-sm">
        {laptop.is_active ? (
          <LaptopForm initial={laptop} />
        ) : (
          <form onSubmit={saveArchivedMetadata} className="space-y-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Archived hardware keeps the same sectioned layout, but only notes, status, and location remain editable until the asset is unarchived.
            </p>
            <div className={sectionCardCls}>
              <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                General
              </h2>
              <div className={rowGridCls}>
                <div>
                  <label className={labelCls}>{LAPTOP_FIELD_LABELS.status}</label>
                  <select
                    className={inputCls}
                    value={hardwareStatusId}
                    onChange={(e) => setHardwareStatusId(e.target.value)}
                    disabled={hardwareStatuses.length === 0}
                  >
                    {hardwareStatuses.length === 0 ? (
                      <option value="">Loading…</option>
                    ) : (
                      hardwareStatuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{LAPTOP_FIELD_LABELS.assigned_to}</label>
                  <p className={readOnlyCls}>
                    {laptop.assigned_to
                      ? `${laptop.assigned_to.first_name} ${laptop.assigned_to.last_name} (${laptop.assigned_to.email})`
                      : "Unassigned"}
                  </p>
                </div>
                <div>
                  <label className={labelCls}>{LAPTOP_FIELD_LABELS.location}</label>
                  <select
                    className={inputCls}
                    value={hardwareLocationId}
                    onChange={(e) => setHardwareLocationId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {hardwareLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className={sectionCardCls}>
              <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                Notes
              </h2>
              <div>
                <label className={labelCls}>{LAPTOP_FIELD_LABELS.notes}</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}
      </div>
    </div>
    </PageTransition>
  );
}
