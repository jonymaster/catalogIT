import { useEffect, useState } from "react";
import axios from "axios";
import client from "../api/client";
import type {
  DashboardCostPayload,
  DashboardCostRecord,
} from "../types/dashboardCost";

// Stable references keep downstream memoized consumers (e.g. Dashboard's
// `ctx`, `actualRecords`, `costByYear`) from invalidating on every render
// while data is still loading. Fresh `[]` literals in the return below would
// otherwise invalidate them and cause FLIP drag animations on the dashboard
// to fire mid-gesture.
const EMPTY_RECORDS: DashboardCostRecord[] = [];
const EMPTY_FISCAL_YEARS: number[] = [];

const EMPTY_DASHBOARD_COST: DashboardCostPayload = {
  cost_records: EMPTY_RECORDS,
  fiscal_years: EMPTY_FISCAL_YEARS,
};

export function useDashboardCostData() {
  const [data, setData] = useState<DashboardCostPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .get<DashboardCostPayload>("/api/dashboard/")
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (axios.isAxiosError(e) && e.response?.status === 403) {
          setData(EMPTY_DASHBOARD_COST);
          setError(null);
          return;
        }
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    data,
    loading,
    error,
    records: data?.cost_records ?? EMPTY_RECORDS,
    fiscalYears: data?.fiscal_years ?? EMPTY_FISCAL_YEARS,
  };
}
