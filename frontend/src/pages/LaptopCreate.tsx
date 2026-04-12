import { Link } from "react-router-dom";
import { LaptopForm } from "../components/LaptopForm";
import { PageTransition } from "../components/PageTransition";

export function LaptopCreate() {
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
          New Laptop
        </h1>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <LaptopForm />
      </div>
    </div>
    </PageTransition>
  );
}
