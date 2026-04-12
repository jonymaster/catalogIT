import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useOutletContext, useParams } from "react-router-dom";
import client from "../../api/client";
import type { Column } from "../../components/DataTable";
import { DataTable } from "../../components/DataTable";
import { PageTransition } from "../../components/PageTransition";
import { SearchInput } from "../../components/SearchInput";
import type {
  ReferenceDataField,
  ReferenceDataRecord,
  ReferenceDataResource,
} from "../../types/referenceData";

function toFieldValue(value: string | null | undefined, required: boolean): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return required ? "" : null;
  }
  return trimmed;
}

function extractErrorDetail(error: unknown, fallback: string): string {
  const maybeError = error as {
    response?: {
      data?: {
        detail?: string;
      };
    };
  };
  if (typeof maybeError.response?.data?.detail === "string") {
    return maybeError.response.data.detail;
  }
  return fallback;
}

function buildEmptyForm(resource: ReferenceDataResource): Record<string, string> {
  return Object.fromEntries(resource.fields.map((field) => [field.key, ""]));
}

function ResourceFieldInput({
  field,
  value,
  onChange,
}: {
  field: ReferenceDataField;
  value: string;
  onChange: (value: string) => void;
}) {
  const sharedClassName =
    "mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.input_type === "textarea" ? (
        <textarea
          rows={4}
          value={value}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
          className={sharedClassName}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type={field.input_type}
          value={value}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
          className={sharedClassName}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.help_text && (
        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{field.help_text}</span>
      )}
    </label>
  );
}

export function SettingsReferenceDataResource() {
  const { resourceKey } = useParams<{ resourceKey: string }>();
  const { resources } = useOutletContext<{ resources: ReferenceDataResource[] }>();
  const resource = resources.find((item) => item.key === resourceKey);

  const dialogRef = useRef<HTMLDialogElement>(null);

  const [records, setRecords] = useState<ReferenceDataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [editingRecord, setEditingRecord] = useState<ReferenceDataRecord | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!resource) {
      return;
    }

    setLoading(true);
    client
      .get<ReferenceDataRecord[]>(resource.api_path)
      .then((response) => {
        setRecords(response.data);
      })
      .catch((error) => {
        setMessage({
          type: "error",
          text: extractErrorDetail(error, `Failed to load ${resource.plural_label.toLowerCase()}.`),
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [resource]);

  const filtered = useMemo(() => {
    if (!resource || !search.trim()) {
      return records;
    }

    const query = search.trim().toLowerCase();
    return records.filter((record) =>
      resource.search_fields.some((fieldKey) =>
        String(record[fieldKey] ?? "")
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [records, resource, search]);

  const reloadRecords = useCallback(async () => {
    if (!resource) {
      return;
    }

    const response = await client.get<ReferenceDataRecord[]>(resource.api_path);
    setRecords(response.data);
  }, [resource]);

  function closeDialog() {
    dialogRef.current?.close();
    setEditingRecord(null);
    if (resource) {
      setFormValues(buildEmptyForm(resource));
    }
  }

  function openCreateDialog() {
    if (!resource) {
      return;
    }
    setEditingRecord(null);
    setFormValues(buildEmptyForm(resource));
    setMessage(null);
    dialogRef.current?.showModal();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!resource) {
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = Object.fromEntries(
      resource.fields.map((field) => [
        field.key,
        toFieldValue(formValues[field.key], field.required),
      ]),
    );

    try {
      if (editingRecord) {
        await client.patch(`${resource.api_path}${editingRecord.id}`, payload);
        setMessage({
          type: "success",
          text: `${resource.label} updated.`,
        });
      } else {
        await client.post(resource.api_path, payload);
        setMessage({
          type: "success",
          text: `${resource.label} created.`,
        });
      }
      await reloadRecords();
      closeDialog();
    } catch (error) {
      setMessage({
        type: "error",
        text: extractErrorDetail(error, `Failed to save ${resource.label.toLowerCase()}.`),
      });
    } finally {
      setSaving(false);
    }
  }

  const handleDelete = useCallback(async (record: ReferenceDataRecord) => {
    if (!resource) {
      return;
    }

    const name = String(record.name ?? resource.label);
    const confirmed = window.confirm(`Delete ${resource.label.toLowerCase()} "${name}"?`);
    if (!confirmed) {
      return;
    }

    setDeletingId(record.id);
    setMessage(null);
    try {
      await client.delete(`${resource.api_path}${record.id}`);
      await reloadRecords();
      setMessage({
        type: "success",
        text: `${resource.label} deleted.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: extractErrorDetail(error, `Failed to delete ${resource.label.toLowerCase()}.`),
      });
    } finally {
      setDeletingId(null);
    }
  }, [reloadRecords, resource]);

  const columns = useMemo<Column<ReferenceDataRecord>[]>(() => {
    if (!resource) {
      return [];
    }

    const fieldColumns = resource.fields
      .filter((field) => field.show_in_list)
      .map<Column<ReferenceDataRecord>>((field) => ({
        key: field.key,
        header: field.label,
        render: (row) => row[field.key] || "--",
      }));

    return [
      ...fieldColumns,
      {
        key: "actions",
        header: "",
        render: (row) => (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              onClick={(event) => {
                event.stopPropagation();
                setEditingRecord(row);
                setFormValues(
                  Object.fromEntries(
                    resource.fields.map((field) => [
                      field.key,
                      String(row[field.key] ?? ""),
                    ]),
                  ),
                );
                setMessage(null);
                dialogRef.current?.showModal();
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-sm text-red-600 hover:text-red-800 dark:text-red-200"
              disabled={deletingId === row.id}
              onClick={(event) => {
                event.stopPropagation();
                void handleDelete(row);
              }}
            >
              {deletingId === row.id ? "Deleting..." : "Delete"}
            </button>
          </div>
        ),
      },
    ];
  }, [deletingId, handleDelete, resource]);

  if (!resource) {
    return <p className="text-sm text-red-600">Reference data resource not found.</p>;
  }

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {resource.plural_label}
          </h3>
          <p className="max-w-2xl text-sm text-gray-600 dark:text-gray-300">{resource.description}</p>
        </div>
        <button
          type="button"
          onClick={openCreateDialog}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Add {resource.label}
        </button>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="max-w-sm">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${resource.plural_label.toLowerCase()}...`}
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      <dialog
        ref={dialogRef}
        className="w-full max-w-2xl rounded-xl border border-gray-200 dark:border-gray-800 p-0 shadow-xl backdrop:bg-black/40 open:fixed open:top-1/2 open:left-1/2 open:-translate-x-1/2 open:-translate-y-1/2 open:m-0"
        onClose={() => {
          setEditingRecord(null);
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="space-y-1">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingRecord ? `Edit ${resource.label}` : `Add ${resource.label}`}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{resource.description}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {resource.fields.map((field) => (
              <div
                key={field.key}
                className={field.input_type === "textarea" ? "md:col-span-2" : undefined}
              >
                <ResourceFieldInput
                  field={field}
                  value={formValues[field.key] ?? ""}
                  onChange={(value) =>
                    setFormValues((current) => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingRecord ? "Save changes" : `Create ${resource.label}`}
            </button>
          </div>
        </form>
      </dialog>
    </div>
    </PageTransition>
  );
}
