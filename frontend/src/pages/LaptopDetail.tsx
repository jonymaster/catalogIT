import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import client from "../api/client";
import { Attachments } from "../components/Attachments";
import { AuditTimeline } from "../components/AuditTimeline";
import { ColoredReferenceBadge } from "../components/Badge";
import { PencilSquareIcon } from "../components/Icons";
import { PageTransition } from "../components/PageTransition";
import { DetailPageSkeleton } from "../components/Skeleton";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import {
  LAPTOP_FIELD_LABELS,
  LAPTOP_VIEW_SECTIONS,
  type LaptopFieldKey,
} from "../hardware/laptopViewLayout";
import type { CostRecord, Laptop } from "../types/models";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
        const cost = r.data;
        if (cost) {
          setPurchaseYear(cost.purchase_year != null ? String(cost.purchase_year) : "");
          setCostAmount(String(cost.amount));
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

  if (loading) return <DetailPageSkeleton />;
  if (!laptop) return <p className="text-sm text-red-600">Laptop not found.</p>;
  const currentLaptop = laptop;

  function renderField(key: LaptopFieldKey) {
    switch (key) {
      case "status":
        return (
          <Field label={LAPTOP_FIELD_LABELS.status}>
            {currentLaptop.hardware_status ? (
              <ColoredReferenceBadge
                label={currentLaptop.hardware_status.name}
                color={currentLaptop.hardware_status.color}
              />
            ) : (
              <StatusBadge status={currentLaptop.status} />
            )}
          </Field>
        );
      case "assigned_to":
        return (
          <Field label={LAPTOP_FIELD_LABELS.assigned_to}>
            {currentLaptop.assigned_to
              ? `${currentLaptop.assigned_to.first_name} ${currentLaptop.assigned_to.last_name} (${currentLaptop.assigned_to.email})`
              : "Unassigned"}
          </Field>
        );
      case "location":
        return (
          <Field label={LAPTOP_FIELD_LABELS.location}>
            {currentLaptop.hardware_location?.name?.trim()
              ? currentLaptop.hardware_location.name
              : "—"}
          </Field>
        );
      case "cpu":
        return <Field label={LAPTOP_FIELD_LABELS.cpu}>{currentLaptop.cpu || "—"}</Field>;
      case "ram":
        return <Field label={LAPTOP_FIELD_LABELS.ram}>{currentLaptop.ram || "—"}</Field>;
      case "storage_size":
        return (
          <Field label={LAPTOP_FIELD_LABELS.storage_size}>
            {currentLaptop.storage_size || "—"}
          </Field>
        );
      case "purchase_year":
        return (
          <Field label={LAPTOP_FIELD_LABELS.purchase_year}>
            {costLoading ? "Loading…" : purchaseYear.trim() || "—"}
          </Field>
        );
      case "purchase_cost":
        return (
          <Field label={LAPTOP_FIELD_LABELS.purchase_cost}>
            {costLoading
              ? "Loading…"
              : costAmount.trim()
                ? `$${Number(costAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : "—"}
          </Field>
        );
      case "notes":
        return (
          <Field label={LAPTOP_FIELD_LABELS.notes}>
            {currentLaptop.notes?.trim() ? currentLaptop.notes : "—"}
          </Field>
        );
    }
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <Link
              to="/hardware"
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              &larr; Back to Hardware
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {currentLaptop.model_name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              S/N: {currentLaptop.serial_number}
            </p>
          </div>
          {canEdit && (
            <Link
              to={`/hardware/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Edit
            </Link>
          )}
        </div>

        {LAPTOP_VIEW_SECTIONS.map((section) => (
          <div
            key={section.id}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              {section.title}
            </h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((key) => (
                <div
                  key={key}
                  className={key === "notes" ? "col-span-full" : undefined}
                >
                  {renderField(key)}
                </div>
              ))}
            </dl>
          </div>
        ))}

        <Attachments entityType="laptop" entityId={currentLaptop.id} />

        <div>
          <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-100">
            Change History
          </h2>
          <AuditTimeline tableName="laptops" recordId={currentLaptop.id} />
        </div>
      </div>
    </PageTransition>
  );
}
