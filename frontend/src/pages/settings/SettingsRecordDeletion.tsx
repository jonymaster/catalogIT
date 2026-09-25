import { useEffect, useState } from "react";
import client from "../../api/client";
import { PageTransition } from "../../components/PageTransition";
import type { HardwareAsset, Service } from "../../types/models";

export function SettingsRecordDeletion() {
  const [services, setServices] = useState<Service[]>([]);
  const [hardware_assets, setHardwareAssets] = useState<HardwareAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function loadArchived() {
    setLoading(true);
    try {
      const [servicesResp, hardware_assetsResp] = await Promise.all([
        client.get<Service[]>("/api/services/", { params: { archived: true } }),
        client.get<HardwareAsset[]>("/api/hardware/", { params: { archived: true } }),
      ]);
      setServices(servicesResp.data);
      setHardwareAssets(hardware_assetsResp.data);
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

  async function deleteHardwareAsset(hardware: HardwareAsset) {
    if (!window.confirm(`Permanently delete archived hardware "${hardware.serial_number}"?`)) {
      return;
    }
    const key = `hardware:${hardware.id}`;
    setBusyKey(key);
    try {
      await client.delete(`/api/hardware/${hardware.id}`);
      setHardwareAssets((current) => current.filter((item) => item.id !== hardware.id));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  }

  return (
    <PageTransition>
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
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
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
        {hardware_assets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No archived hardware records available.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Serial Number</th>
                  <th className="px-4 py-2 text-left">Model</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {hardware_assets.map((hardware) => {
                  const key = `hardware:${hardware.id}`;
                  const deleting = busyKey === key;
                  return (
                    <tr key={hardware.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-4 py-2">{hardware.serial_number}</td>
                      <td className="px-4 py-2">{hardware.model_name}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void deleteHardwareAsset(hardware)}
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
    </PageTransition>
  );
}
