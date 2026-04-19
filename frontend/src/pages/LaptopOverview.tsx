import type { ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { BooleanYesNoBadge, ColoredReferenceBadge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { OsIcon } from "../components/ui/OsIcon";
import { operatingSystemLabel } from "../utils/operatingSystem";
import type { Laptop } from "../types/models";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

export type LaptopDetailOutletContext = {
  laptop: Laptop;
  purchaseYear: string;
  costAmount: string;
  costLoading: boolean;
};

export function LaptopOverview() {
  const { laptop, purchaseYear, costAmount, costLoading } =
    useOutletContext<LaptopDetailOutletContext>();

  return (
    <div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <dl className="space-y-6">
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <Field label="Operating system">
              <span className="inline-flex items-center gap-2">
                <OsIcon operatingSystem={laptop.operating_system} className="h-5 w-5 shrink-0" />
                <span>{operatingSystemLabel(laptop.operating_system)}</span>
              </span>
            </Field>
            <Field label="Status">
              {laptop.hardware_status ? (
                <ColoredReferenceBadge
                  label={laptop.hardware_status.name}
                  color={laptop.hardware_status.color}
                />
              ) : (
                <StatusBadge status={laptop.status} />
              )}
            </Field>
            <Field label="Assigned To">
              {laptop.assigned_to ? (
                <>
                  <Link
                    to={`/users/${laptop.assigned_to.id}`}
                    className="hlink"
                  >
                    {laptop.assigned_to.first_name} {laptop.assigned_to.last_name}
                  </Link>{" "}
                  ({laptop.assigned_to.email})
                </>
              ) : (
                "Unassigned"
              )}
            </Field>
            <Field label="Location">
              {laptop.hardware_location?.name?.trim() ? laptop.hardware_location.name : "—"}
            </Field>
            <Field label="MDM Connected">
              <BooleanYesNoBadge value={laptop.mdm_connected} />
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
    </div>
  );
}
