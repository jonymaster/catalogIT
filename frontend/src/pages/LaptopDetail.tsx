import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { Attachments } from "../components/Attachments";
import { AuditTimeline } from "../components/AuditTimeline";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import type { CostRecord, Laptop } from "../types/models";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

export function LaptopDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useAuth();
  const [laptop, setLaptop] = useState<Laptop | null>(null);
  const [loading, setLoading] = useState(true);
  const [costLoading, setCostLoading] = useState(true);
  const [purchaseYear, setPurchaseYear] = useState("");
  const [costAmount, setCostAmount] = useState("");

  const loadCost = useCallback(() => {
    if (!id) return;
    setCostLoading(true);
    client
      .get<CostRecord | null>(`/api/laptops/${id}/hardware-cost`)
      .then((r) => {
        const c = r.data;
        if (c) {
          setPurchaseYear(c.purchase_year != null ? String(c.purchase_year) : "");
          setCostAmount(String(c.amount));
        } else {
          setPurchaseYear("");
          setCostAmount("");
        }
      })
      .finally(() => setCostLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    client
      .get<Laptop>(`/api/laptops/${id}`)
      .then((r) => setLaptop(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadCost();
  }, [loadCost]);

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  if (!laptop) return <p className="text-sm text-red-600">Laptop not found.</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/hardware" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            &larr; Back to Hardware
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {laptop.model_name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">S/N: {laptop.serial_number}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link
              to={`/hardware/${id}/edit`}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Edit
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <dl className="space-y-6">
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <Field label="Status">
              <StatusBadge status={laptop.status} />
            </Field>
            <Field label="Assigned To">
              {laptop.assigned_to
                ? `${laptop.assigned_to.first_name} ${laptop.assigned_to.last_name} (${laptop.assigned_to.email})`
                : "Unassigned"}
            </Field>
            <Field label="Location">
              {laptop.hardware_location?.name?.trim() ? laptop.hardware_location.name : "—"}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <Field label="CPU">{laptop.cpu || "--"}</Field>
            <Field label="RAM">{laptop.ram || "--"}</Field>
            <Field label="Storage">{laptop.storage_size || "--"}</Field>
          </div>

          {costLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading purchase &amp; cost…</div>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
              <Field label="Purchase year">
                {purchaseYear.trim() ? purchaseYear : "—"}
              </Field>
              <Field label="Cost">
                {costAmount.trim()
                  ? `$${Number(costAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "—"}
              </Field>
            </div>
          )}

          <div>
            <Field label="Notes">
              {laptop.notes?.trim() ? laptop.notes : "—"}
            </Field>
          </div>
        </dl>
      </div>

      <Attachments entityType="laptop" entityId={laptop.id} />

      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-100">Change History</h2>
        <AuditTimeline tableName="laptops" recordId={laptop.id} />
      </div>
    </div>
  );
}
