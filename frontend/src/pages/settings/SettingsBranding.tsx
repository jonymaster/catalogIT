import { useState, type FormEvent } from "react";
import client from "../../api/client";
import { useToast } from "../../context/useToast";
import { useBranding } from "../../hooks/useBranding";

export function SettingsBranding() {
  const { branding, loading, reload } = useBranding();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { showToast } = useToast();

  const logoUrl =
    branding.logo_url && branding.updated_at
      ? `${branding.logo_url}?v=${encodeURIComponent(branding.updated_at)}`
      : branding.logo_url;

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      await client.post("/api/settings/branding/logo", formData);
      await reload();
      window.dispatchEvent(new Event("catalogit:branding-updated"));
      setFile(null);
      showToast({ type: "success", text: "Logo uploaded." });
    } catch (error: unknown) {
      const detail =
        error instanceof Object && "response" in error
          ? (error as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      showToast({
        type: "error",
        text: detail || "Failed to upload logo.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);

    try {
      await client.delete("/api/settings/branding/logo");
      await reload();
      window.dispatchEvent(new Event("catalogit:branding-updated"));
      showToast({ type: "success", text: "Logo removed." });
    } catch {
      showToast({ type: "error", text: "Failed to remove logo." });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <form
      onSubmit={handleUpload}
      className="max-w-xl space-y-6 rounded-lg border border-gray-200 bg-white p-6"
    >
      <div>
        <h2 className="text-lg font-medium text-gray-900">Branding</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload a logo to show it on the login screen and in the app sidebar.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Current logo</p>
        {loading ? (
          <p className="text-sm text-gray-500">Loading branding...</p>
        ) : logoUrl ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <img
              src={logoUrl}
              alt="Current logo"
              className="max-h-20 w-auto object-contain"
            />
            {branding.logo_filename && (
              <p className="mt-3 text-sm text-gray-500">
                File: {branding.logo_filename}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No logo uploaded yet.</p>
        )}
      </div>

      <div>
        <label
          htmlFor="branding-logo"
          className="block text-sm font-medium text-gray-700"
        >
          Upload logo
        </label>
        <input
          id="branding-logo"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700"
        />
        <p className="mt-2 text-xs text-gray-500">
          Stored in MinIO. Accepted formats: PNG, JPG, SVG, or WebP. Maximum
          size: 5 MB. No fixed pixel dimensions are enforced.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload logo"}
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={!branding.logo_url || removing}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {removing ? "Removing..." : "Remove logo"}
        </button>
      </div>
    </form>
  );
}
