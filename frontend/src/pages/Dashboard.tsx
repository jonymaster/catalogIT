import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Service, Laptop } from "../types/models";

interface Stats {
  totalServices: number;
  totalLaptops: number;
  assignedLaptops: number;
  inStockLaptops: number;
}

function StatCard({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-gray-200 bg-white p-6 ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
    >
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalServices: 0,
    totalLaptops: 0,
    assignedLaptops: 0,
    inStockLaptops: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      client.get<Service[]>("/api/services/"),
      client.get<Laptop[]>("/api/laptops/"),
    ])
      .then(([servicesRes, laptopsRes]) => {
        const services = servicesRes.data;
        const laptops = laptopsRes.data;
        setStats({
          totalServices: services.length,
          totalLaptops: laptops.length,
          assignedLaptops: laptops.filter((l) => l.status === "Assigned").length,
          inStockLaptops: laptops.filter((l) => l.status === "In Stock").length,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Welcome{user?.email ? `, ${user.email}` : ""}.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading stats...</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Services"
            value={stats.totalServices}
            onClick={() => navigate("/services")}
          />
          <StatCard
            label="Total Laptops"
            value={stats.totalLaptops}
            onClick={() => navigate("/hardware")}
          />
          <StatCard label="Assigned Laptops" value={stats.assignedLaptops} />
          <StatCard label="In Stock Laptops" value={stats.inStockLaptops} />
        </div>
      )}
    </div>
  );
}
