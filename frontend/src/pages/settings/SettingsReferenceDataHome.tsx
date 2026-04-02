import { Link, useOutletContext } from "react-router-dom";
import type { ReferenceDataResource } from "../../types/referenceData";

export function SettingsReferenceDataHome() {
  const { resources } = useOutletContext<{ resources: ReferenceDataResource[] }>();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {resources.map((resource) => (
        <Link
          key={resource.key}
          to={resource.key}
          className="rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          <h3 className="text-base font-medium text-gray-900">
            {resource.plural_label}
          </h3>
          <p className="mt-2 text-sm text-gray-600">{resource.description}</p>
        </Link>
      ))}
    </div>
  );
}
