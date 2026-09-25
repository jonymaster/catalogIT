import { Link, useLocation } from "react-router-dom";
import { HardwareAssetForm } from "../components/HardwareAssetForm";
import { PageTransition } from "../components/PageTransition";
import type { HardwareAsset } from "../types/models";

export function HardwareAssetCreate() {
  const location = useLocation();
  const duplicateFrom = (
    location.state as { duplicateFrom?: HardwareAsset } | null
  )?.duplicateFrom;
  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <Link
          to="/hardware"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          &larr; Back to Hardware
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {duplicateFrom ? `Duplicate ${duplicateFrom.model_name}` : "New hardware asset"}
        </h1>
        {duplicateFrom && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Review the copied details and enter the new device identifiers before saving.
          </p>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <HardwareAssetForm
          key={duplicateFrom?.id ?? "new"}
          initial={duplicateFrom}
          duplicate={!!duplicateFrom}
        />
      </div>
    </div>
    </PageTransition>
  );
}
