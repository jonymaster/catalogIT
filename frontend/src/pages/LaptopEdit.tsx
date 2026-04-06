import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { LaptopForm } from "../components/LaptopForm";
import type { Laptop } from "../types/models";

export function LaptopEdit() {
  const { id } = useParams<{ id: string }>();
  const [laptop, setLaptop] = useState<Laptop | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    client
      .get<Laptop>(`/api/laptops/${id}`)
      .then((r) => {
        setLaptop(r.data);
        setStatus(r.data.status);
        setNotes(r.data.notes ?? "");
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function saveArchivedMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const response = await client.put<Laptop>(`/api/laptops/${id}`, {
        status,
        notes: notes.trim() || null,
      });
      setLaptop(response.data);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!id || !laptop) return;
    const endpoint = laptop.is_active
      ? `/api/laptops/${id}/archive`
      : `/api/laptops/${id}/unarchive`;
    const response = await client.post<Laptop>(endpoint);
    setLaptop(response.data);
    setStatus(response.data.status);
    setNotes(response.data.notes ?? "");
  }

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  if (!laptop)
    return <p className="text-sm text-red-600">Laptop not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/hardware/${id}`}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          &larr; Back to {laptop.model_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Edit {laptop.model_name}
        </h1>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleArchiveToggle}
            className={
              laptop.is_active
                ? "rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                : "rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            }
          >
            {laptop.is_active ? "Archive" : "Unarchive"}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        {laptop.is_active ? (
          <LaptopForm initial={laptop} />
        ) : (
          <form onSubmit={saveArchivedMetadata} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Archived hardware supports metadata-only updates.
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
              className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
