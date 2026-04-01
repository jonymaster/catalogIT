import { Link } from "react-router-dom";
import { ServiceForm } from "../components/ServiceForm";

export function ServiceCreate() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/services"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Services
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          New Service
        </h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <ServiceForm />
      </div>
    </div>
  );
}
