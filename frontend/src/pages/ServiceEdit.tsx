import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { FormSkeleton } from "../components/Skeleton";
import { ServiceForm } from "../components/ServiceForm";
import type { Service } from "../types/models";

export function ServiceEdit() {
  const { id } = useParams<{ id: string }>();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [pointOfContact, setPointOfContact] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    client
      .get<Service>(`/api/services/${id}`)
      .then((r) => {
        setService(r.data);
        setStatus(r.data.status);
        setPointOfContact(r.data.point_of_contact ?? "");
        setNotes(r.data.notes ?? "");
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function saveArchivedMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const response = await client.put<Service>(`/api/services/${id}`, {
        status,
        point_of_contact: pointOfContact.trim() || null,
        notes: notes.trim() || null,
      });
      setService(response.data);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!id || !service) return;
    const endpoint = service.is_active
      ? `/api/services/${id}/archive`
      : `/api/services/${id}/unarchive`;
    const response = await client.post<Service>(endpoint);
    setService(response.data);
    setStatus(response.data.status);
    setPointOfContact(response.data.point_of_contact ?? "");
    setNotes(response.data.notes ?? "");
  }

  if (loading) return <FormSkeleton />;
  if (!service)
    return <p className="text-sm text-red-600">Service not found.</p>;

  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <Link
          to={`/services/${id}`}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          &larr; Back to {service.name}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {service.name}
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            Editing
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleArchiveToggle}
            className={
              service.is_active
                ? "rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                : "rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            }
          >
            {service.is_active ? "Archive" : "Unarchive"}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-brand-500 bg-white dark:bg-gray-900 p-6 shadow-sm">
        {service.is_active ? (
          <ServiceForm initial={service} />
        ) : (
          <form onSubmit={saveArchivedMetadata} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Archived services support metadata-only updates.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Status
              </label>
              <input
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Point of contact
              </label>
              <input
                value={pointOfContact}
                onChange={(event) => setPointOfContact(event.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                placeholder="e.g. Jane Doe (Vendor Account Manager)"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Main person to contact for account management or vendor support.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}
      </div>
    </div>
    </PageTransition>
  );
}
