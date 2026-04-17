import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import {
  LAPTOP_FIELD_LABELS,
  LAPTOP_VIEW_SECTIONS,
  type LaptopFieldKey,
} from "../hardware/laptopViewLayout";
import type {
  CostRecord,
  HardwareLocation,
  HardwareStatus,
  Laptop,
  User,
} from "../types/models";

interface Props {
  initial?: Laptop;
}

interface FormData {
  serial_number: string;
  model_name: string;
  cpu: string;
  ram: string;
  storage_size: string;
  status: string;
  hardware_status_id: string;
  hardware_location_id: string;
  assigned_to_id: string;
  notes: string;
  /** Shown on create only; stored on the first cost record, not on the laptop row */
  purchase_year: string;
  purchase_cost: string;
}

function toFormData(l?: Laptop): FormData {
  return {
    serial_number: l?.serial_number ?? "",
    model_name: l?.model_name ?? "",
    cpu: l?.cpu ?? "",
    ram: l?.ram ?? "",
    storage_size: l?.storage_size ?? "",
    status: l?.status ?? "In Stock",
    hardware_status_id: l?.hardware_status_id ?? "",
    hardware_location_id: l?.hardware_location_id ?? "",
    assigned_to_id: l?.assigned_to_id ?? "",
    notes: l?.notes ?? "",
    purchase_year: "",
    purchase_cost: "",
  };
}

export function LaptopForm({ initial }: Props) {
  const navigate = useNavigate();
  const isEdit = !!initial;

  const [form, setForm] = useState<FormData>(() => toFormData(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [hardwareStatuses, setHardwareStatuses] = useState<HardwareStatus[]>([]);
  const [hardwareLocations, setHardwareLocations] = useState<HardwareLocation[]>(
    [],
  );

  useEffect(() => {
    client.get<User[]>("/api/users/").then((r) => setUsers(r.data));
  }, []);

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
    if (hardwareStatuses.length === 0) return;
    setForm((prev) => {
      if (prev.hardware_status_id) return prev;
      const byName = hardwareStatuses.find(
        (status) => status.name.toLowerCase() === prev.status.trim().toLowerCase(),
      );
      if (byName) {
        return {
          ...prev,
          hardware_status_id: byName.id,
          status: byName.name,
        };
      }
      if (!isEdit) {
        const inStock = hardwareStatuses.find((status) => status.name === "In Stock");
        if (inStock) {
          return {
            ...prev,
            hardware_status_id: inStock.id,
            status: inStock.name,
          };
        }
      }
      return prev;
    });
  }, [hardwareStatuses, isEdit]);

  useEffect(() => {
    if (!initial?.id || !initial.is_active) return;
    client
      .get<CostRecord | null>(`/api/laptops/${initial.id}/hardware-cost`)
      .then((r) => {
        const cost = r.data;
        if (cost) {
          setForm((prev) => ({
            ...prev,
            purchase_year:
              cost.purchase_year != null ? String(cost.purchase_year) : "",
            purchase_cost: String(cost.amount),
          }));
        }
      })
      .catch(() => {});
  }, [initial?.id, initial?.is_active]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      serial_number: form.serial_number,
      model_name: form.model_name,
      cpu: form.cpu,
      ram: form.ram,
      storage_size: form.storage_size,
      status: form.status,
      hardware_status_id: form.hardware_status_id || null,
      hardware_location_id: form.hardware_location_id || null,
      assigned_to_id: form.assigned_to_id || null,
      notes: form.notes || null,
    };

    try {
      if (isEdit) {
        await client.put(`/api/laptops/${initial.id}`, payload);
        if (initial.is_active) {
          const pyRaw = form.purchase_year.trim();
          const py = pyRaw ? Number(pyRaw) : null;
          const costRaw = form.purchase_cost.trim();
          const costAmt = costRaw ? Number(costRaw) : 0;
          await client.put(`/api/laptops/${initial.id}/hardware-cost`, {
            amount: Number.isFinite(costAmt) && costAmt >= 0 ? costAmt : 0,
            purchase_year: py != null && Number.isFinite(py) ? py : null,
          });
        }
        navigate(`/hardware/${initial.id}`);
      } else {
        const res = await client.post<Laptop>("/api/laptops/", payload);
        const laptopId = res.data.id;
        const pyRaw = form.purchase_year.trim();
        const py = pyRaw ? Number(pyRaw) : null;
        const costRaw = form.purchase_cost.trim();
        const costAmt = costRaw ? Number(costRaw) : 0;
        await client.put(`/api/laptops/${laptopId}/hardware-cost`, {
          amount: Number.isFinite(costAmt) && costAmt >= 0 ? costAmt : 0,
          purchase_year: py != null && Number.isFinite(py) ? py : null,
        });
        navigate(`/hardware/${laptopId}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save laptop";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-200";
  const sectionCardCls =
    "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm";

  function renderFieldControl(key: LaptopFieldKey) {
    switch (key) {
      case "status":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.status}</label>
            <select
              className={inputCls}
              value={form.hardware_status_id}
              onChange={(e) => {
                const id = e.target.value;
                const row = hardwareStatuses.find((status) => status.id === id);
                setForm((prev) => ({
                  ...prev,
                  hardware_status_id: id,
                  status: row?.name ?? prev.status,
                }));
              }}
              disabled={hardwareStatuses.length === 0}
            >
              {hardwareStatuses.length === 0 ? (
                <option value="">Loading statuses…</option>
              ) : (
                hardwareStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))
              )}
            </select>
          </div>
        );
      case "assigned_to":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.assigned_to}</label>
            <select
              className={inputCls}
              value={form.assigned_to_id}
              onChange={(e) => set("assigned_to_id", e.target.value)}
            >
              <option value="">-- Unassigned --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        );
      case "location":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.location}</label>
            <select
              className={inputCls}
              value={form.hardware_location_id}
              onChange={(e) => set("hardware_location_id", e.target.value)}
            >
              <option value="">— None —</option>
              {hardwareLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        );
      case "cpu":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.cpu}</label>
            <input
              className={inputCls}
              value={form.cpu}
              onChange={(e) => set("cpu", e.target.value)}
            />
          </div>
        );
      case "ram":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.ram}</label>
            <input
              className={inputCls}
              value={form.ram}
              onChange={(e) => set("ram", e.target.value)}
            />
          </div>
        );
      case "storage_size":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.storage_size}</label>
            <input
              className={inputCls}
              value={form.storage_size}
              onChange={(e) => set("storage_size", e.target.value)}
            />
          </div>
        );
      case "purchase_year":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.purchase_year}</label>
            <input
              type="number"
              min={1900}
              max={2100}
              className={inputCls}
              value={form.purchase_year}
              onChange={(e) => set("purchase_year", e.target.value)}
              placeholder="Optional"
            />
          </div>
        );
      case "purchase_cost":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.purchase_cost}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls}
              value={form.purchase_cost}
              onChange={(e) => set("purchase_cost", e.target.value)}
              placeholder="Optional"
            />
          </div>
        );
      case "notes":
        return (
          <div>
            <label className={labelCls}>{LAPTOP_FIELD_LABELS.notes}</label>
            <textarea
              className={inputCls}
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">
          {error}
        </div>
      )}

      <div className={sectionCardCls}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Serial Number *</label>
            <input
              required
              className={inputCls}
              value={form.serial_number}
              onChange={(e) => set("serial_number", e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>Model Name *</label>
            <input
              required
              className={inputCls}
              value={form.model_name}
              onChange={(e) => set("model_name", e.target.value)}
            />
          </div>
        </div>
      </div>

      {LAPTOP_VIEW_SECTIONS.map((section) => {
        const visibleFields = section.fields.filter((key) => {
          if (key === "purchase_year" || key === "purchase_cost") {
            return !isEdit || (initial?.is_active ?? false);
          }
          return true;
        });

        if (visibleFields.length === 0) {
          return null;
        }

        return (
          <div key={section.id} className={sectionCardCls}>
            <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleFields.map((key) => (
                <div
                  key={key}
                  className={key === "notes" ? "col-span-full" : undefined}
                >
                  {renderFieldControl(key)}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Update Laptop" : "Create Laptop"}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
