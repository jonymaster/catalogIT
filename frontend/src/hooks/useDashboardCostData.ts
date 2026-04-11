import { useEffect, useState } from "react";
import client from "../api/client";
import type { DashboardCostPayload } from "../types/dashboardCost";

export function useDashboardCostData() {
  const [data, setData] = useState<DashboardCostPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .get<DashboardCostPayload>("/api/dashboard/")
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e);
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
    records: data?.cost_records ?? [],
    fiscalYears: data?.fiscal_years ?? [],
  };
}
