import { useCallback, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import client from "../api/client";
import { AuditTimeline } from "../components/AuditTimeline";
import { PageTransition } from "../components/PageTransition";
import { DetailPageSkeleton } from "../components/Skeleton";
import { PencilSquareIcon } from "../components/Icons";
import { useAuth } from "../context/useAuth";
import type { CostRecord, Laptop } from "../types/models";
import type { LaptopDetailOutletContext } from "./LaptopOverview";

export function LaptopDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [laptop, setLaptop] = useState<Laptop | null>(null);
  const [extraTab, setExtraTab] = useState<"activity" | null>(null);
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

  const isIndexRoute =
    id != null &&
    (location.pathname === `/hardware/${id}` ||
      location.pathname === `/hardware/${id}/`);

  useEffect(() => {
    if (!isIndexRoute) setExtraTab(null);
  }, [isIndexRoute]);

  if (loading) return <DetailPageSkeleton />;
  if (!laptop) return <p className="text-sm text-red-600">Laptop not found.</p>;

  const outletContext: LaptopDetailOutletContext = {
    laptop,
    purchaseYear,
    costAmount,
    costLoading,
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link
              to="/hardware"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              &larr; Back to Hardware
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {laptop.model_name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">S/N: {laptop.serial_number}</p>
          </div>
          {canEdit && (
            <Link
              to={`/hardware/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-150 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Edit
            </Link>
          )}
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                setExtraTab(null);
                navigate(`/hardware/${id}`);
              }}
              className={`inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
                isIndexRoute && extraTab === null
                  ? "border-blue-600 text-gray-900 dark:border-blue-400 dark:text-gray-100"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              }`}
            >
              Overview
            </button>
            <NavLink
              to={`/hardware/${id}/attachments`}
              onClick={() => setExtraTab(null)}
              className={({ isActive }) =>
                `inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-blue-600 text-gray-900 dark:border-blue-400 dark:text-gray-100"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
                }`
              }
            >
              Attachments
            </NavLink>
            <button
              type="button"
              onClick={() => {
                if (!isIndexRoute) navigate(`/hardware/${id}`);
                setExtraTab("activity");
              }}
              className={`inline-flex items-center whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors ${
                isIndexRoute && extraTab === "activity"
                  ? "border-blue-600 text-gray-900 dark:border-blue-400 dark:text-gray-100"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              }`}
            >
              Activity
            </button>
          </nav>
        </div>

        {extraTab === "activity" ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">
              Activity
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Recent changes to this laptop.
            </p>
            <AuditTimeline tableName="laptops" recordId={laptop.id} perPage={20} />
          </div>
        ) : (
          <Outlet context={outletContext} />
        )}
      </div>
    </PageTransition>
  );
}
