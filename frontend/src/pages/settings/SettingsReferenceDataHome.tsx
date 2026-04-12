import { Link, useOutletContext } from "react-router-dom";
import { PageTransition } from "../../components/PageTransition";
import type { ReferenceDataResource } from "../../types/referenceData";

export function SettingsReferenceDataHome() {
  const { resources } = useOutletContext<{ resources: ReferenceDataResource[] }>();

  return (
    <PageTransition>
    <div className="grid gap-4 md:grid-cols-2">
      {resources.map((resource) => (
        <Link
          key={resource.key}
          to={resource.key}
          className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 transition-colors hover:border-gray-300 dark:hover:border-gray-600 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
            {resource.plural_label}
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{resource.description}</p>
        </Link>
      ))}
    </div>
    </PageTransition>
  );
}
