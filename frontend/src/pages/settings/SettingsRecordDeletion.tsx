import { useEffect, useState } from "react";
import client from "../../api/client";
import type { Laptop, Service } from "../../types/models";

export function SettingsRecordDeletion() {
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function loadArchived() {
    setLoading(true);
    try {
      const [servicesResp, laptopsResp] = await Promise.all([
        client.get<Service[]>("/api/services/", { params: { archived: true } }),
        client.get<Laptop[]>("/api/laptops/", { params: { archived: true } }),
      ]);
      setServices(servicesResp.data);
      setLaptops(laptopsResp.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadArchived();
  }, []);

  async function deleteService(service: Service) {
    if (!window.confirm(`Permanently delete archived service "${service.name}"?`)) {
      return;
    }
    const key = `service:${service.id}`;
    setBusyKey(key);
    try {
      await client.delete(`/api/services/${service.id}`);
      setServices((current) => current.filter((item) => item.id !== service.id));
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteLaptop(laptop: Laptop) {
    if (!window.confirm(`Permanently delete archived laptop "${laptop.serial_number}"?`)) {
      return;
    }
    const key = `laptop:${laptop.id}`;
    setBusyKey(key);
    try {
      await client.delete(`/api/laptops/${laptop.id}`);
      setLaptops((current) => current.filter((item) => item.id !== laptop.id));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Record Deletion</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Permanent deletion is available only for archived records. Use this only for cleanup operations.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">Archived Services</h3>
        {services.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No archived services available.</p>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const key = `service:${service.id}`;
                  const deleting = busyKey === key;
                  return (
                    <tr key={service.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-4 py-2">{service.name}</td>
                      <td className="px-4 py-2">{service.status}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void deleteService(service)}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {deleting ? "Deleting..." : "Delete Permanently"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">Archived Hardware</h3>
        {laptops.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No archived hardware records available.</p>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Serial Number</th>
                  <th className="px-4 py-2 text-left">Model</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {laptops.map((laptop) => {
                  const key = `laptop:${laptop.id}`;
                  const deleting = busyKey === key;
                  return (
                    <tr key={laptop.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-4 py-2">{laptop.serial_number}</td>
                      <td className="px-4 py-2">{laptop.model_name}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void deleteLaptop(laptop)}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {deleting ? "Deleting..." : "Delete Permanently"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
