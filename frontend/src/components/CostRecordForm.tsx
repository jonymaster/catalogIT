import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import type { CostRecord, PaymentMethod } from "../types/models";

interface Props {
  serviceId: string;
  initial?: CostRecord;
}

interface FormData {
  fiscal_year: string;
  amount: string;
  record_type: string;
  payment_method_id: string;
  notes: string;
}

const RECORD_TYPE_OPTIONS = [
  { value: "actual", label: "Actual" },
  { value: "estimated", label: "Estimated" },
  { value: "budget", label: "Budget" },
];

function toFormData(r?: CostRecord): FormData {
  return {
    fiscal_year: r?.fiscal_year != null ? String(r.fiscal_year) : String(new Date().getFullYear()),
    amount: r?.amount != null ? String(r.amount) : "",
    record_type: r?.record_type ?? "actual",
    payment_method_id: r?.payment_method_id ?? "",
    notes: r?.notes ?? "",
  };
}

export function CostRecordForm({ serviceId, initial }: Props) {
  const navigate = useNavigate();
  const isEdit = !!initial;

  const [form, setForm] = useState<FormData>(() => toFormData(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    client
      .get<PaymentMethod[]>("/api/payment-methods/")
      .then((r) => setPaymentMethods(r.data));
  }, []);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      fiscal_year: Number(form.fiscal_year),
      amount: Number(form.amount),
      record_type: form.record_type,
      payment_method_id: form.payment_method_id || null,
      notes: form.notes || null,
    };

    try {
      if (isEdit) {
        await client.put(
          `/api/services/${serviceId}/cost-records/${initial.id}`,
          payload,
        );
      } else {
        await client.post(
          `/api/services/${serviceId}/cost-records/`,
          payload,
        );
      }
      navigate(`/services/${serviceId}/costs`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save cost record";
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
          <label className={labelCls}>Fiscal Year *</label>
          <input
            required
            type="number"
            className={inputCls}
            value={form.fiscal_year}
            onChange={(e) => set("fiscal_year", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Amount ($) *</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Record Type *</label>
          <select
            required
            className={inputCls}
            value={form.record_type}
            onChange={(e) => set("record_type", e.target.value)}
          >
            {RECORD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Payment Method</label>
          <select
            className={inputCls}
            value={form.payment_method_id}
            onChange={(e) => set("payment_method_id", e.target.value)}
          >
            <option value="">-- None --</option>
            {paymentMethods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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
          {saving
            ? "Saving..."
            : isEdit
              ? "Update Cost Record"
              : "Create Cost Record"}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/services/${serviceId}/costs`)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
