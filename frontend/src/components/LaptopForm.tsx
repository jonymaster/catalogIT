import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import type { Laptop, User } from "../types/models";

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
  assigned_to_id: string;
  notes: string;
}

const STATUS_OPTIONS = [
  "In Stock",
  "Assigned",
  "In Repair",
  "Dismissed",
  "Retired",
  "Lost",
];

function toFormData(l?: Laptop): FormData {
  return {
    serial_number: l?.serial_number ?? "",
    model_name: l?.model_name ?? "",
    cpu: l?.cpu ?? "",
    ram: l?.ram ?? "",
    storage_size: l?.storage_size ?? "",
    status: l?.status ?? "In Stock",
    assigned_to_id: l?.assigned_to_id ?? "",
    notes: l?.notes ?? "",
  };
}

export function LaptopForm({ initial }: Props) {
  const navigate = useNavigate();
  const isEdit = !!initial;

  const [form, setForm] = useState<FormData>(() => toFormData(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    client.get<User[]>("/api/settings/users/").then((r) => setUsers(r.data));
  }, []);

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
      assigned_to_id: form.assigned_to_id || null,
      notes: form.notes || null,
    };

    try {
      if (isEdit) {
        await client.put(`/api/laptops/${initial.id}`, payload);
        navigate(`/hardware/${initial.id}`);
      } else {
        const res = await client.post<Laptop>("/api/laptops/", payload);
        navigate(`/hardware/${res.data.id}`);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save laptop";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500";
  const labelCls = "block text-sm font-medium text-gray-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

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

        <div>
          <label className={labelCls}>CPU</label>
          <input
            className={inputCls}
            value={form.cpu}
            onChange={(e) => set("cpu", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>RAM</label>
          <input
            className={inputCls}
            value={form.ram}
            onChange={(e) => set("ram", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Storage Size</label>
          <input
            className={inputCls}
            value={form.storage_size}
            onChange={(e) => set("storage_size", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <select
            className={inputCls}
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Assigned To</label>
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
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          className={inputCls}
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Update Laptop" : "Create Laptop"}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
