import { useEffect, useState } from "react";
import axios from "axios";
import client from "../api/client";
import type { DashboardCostPayload } from "../types/dashboardCost";

const EMPTY_DASHBOARD_COST: DashboardCostPayload = {
  cost_records: [],
  fiscal_years: [],
};

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
    records: data?.cost_records ?? [],
    fiscalYears: data?.fiscal_years ?? [],
  };
}
