import { Link } from "react-router-dom";
import { LaptopForm } from "../components/LaptopForm";

export function LaptopCreate() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/hardware"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Hardware
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          New Laptop
        </h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <LaptopForm />
      </div>
    </div>
  );
}
