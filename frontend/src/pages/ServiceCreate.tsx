import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { ServiceForm } from "../components/ServiceForm";

export function ServiceCreate() {
  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <Link
          to="/services"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          &larr; Back to Services
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          New Service
        </h1>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <ServiceForm />
      </div>
    </div>
    </PageTransition>
  );
}
