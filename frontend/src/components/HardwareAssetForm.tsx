import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import {
  HARDWARE_FIELD_LABELS,
  HARDWARE_VIEW_SECTIONS,
  type HardwareAssetFieldKey,
} from "../hardware/hardwareViewLayout";
import { OsIcon } from "./ui/OsIcon";
import { Button } from "./ui/Button";
import { HardwareTypeFields } from "./HardwareTypeFields";
import { isSimpleHardware, osOptionsForType } from "../hardware/hardwareTypes";
import { useAuth } from "../context/useAuth";
import { toDraft, draftToHardwareAssetPayload, validateDraft, type HardwareAssetDraft } from "../service/hardwareDetailContext";
import type {
  CostRecord,
  HardwareLocation,
  HardwareStatus,
  HardwareAsset,
  OperatingSystem,
  User,
} from "../types/models";

interface Props {
  initial?: HardwareAsset;
  duplicate?: boolean;
}

type FormData = HardwareAssetDraft;
type HardwareAssetFieldErrorKey = keyof HardwareAssetDraft;

function toFormData(l?: HardwareAsset): FormData {
  if (l) return toDraft(l);
  return {
    hardware_type: "laptop",
    quantity: 1,
    os_version: "", imei: "", imei2: "", phone_number: "",
    serial_number: "",
    model_name: "",
    operating_system: "",
    cpu: "",
    ram: "",
    storage_size: "",
    status: "In Stock",
    hardware_status_id: "",
    hardware_location_id: "",
    assigned_to_id: "",
    notes: "",
    mdm_connected: false,
    purchase_year: "",
    purchase_cost: "",
  };
}

export function HardwareAssetForm({ initial, duplicate = false }: Props = {}) {
  const navigate = useNavigate();
  const { canFinancialView } = useAuth();
  const isEdit = Boolean(initial?.id) && !duplicate;

  const [form, setForm] = useState<FormData>(() => {
    const source = toFormData(initial);
    return duplicate ? {
      ...source,
      serial_number: "",
      imei: "",
      imei2: "",
      phone_number: "",
      status: "In Stock",
      hardware_status_id: "",
      assigned_to_id: "",
      mdm_connected: false,
    } : source;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<HardwareAssetFieldErrorKey, string>>
  >({});
  const [users, setUsers] = useState<User[]>([]);
  const [hardwareStatuses, setHardwareStatuses] = useState<HardwareStatus[]>(
    [],
  );
  const [hardwareLocations, setHardwareLocations] = useState<
    HardwareLocation[]
  >([]);

  useEffect(() => {
    client.get<User[]>("/api/users/").then((r) => setUsers(r.data));
  }, []);

  useEffect(() => {
    client
      .get<HardwareStatus[]>("/api/hardware-statuses/")
      .then((r) => setHardwareStatuses(r.data))
      .catch(() => setHardwareStatuses([]));
    client
      .get<HardwareLocation[]>("/api/hardware-locations/")
      .then((r) => setHardwareLocations(r.data))
      .catch(() => setHardwareLocations([]));
  }, []);

  useEffect(() => {
    if (hardwareStatuses.length === 0) return;
    setForm((prev) => {
      if (prev.hardware_status_id) return prev;
      const byName = hardwareStatuses.find(
        (status) => status.name.toLowerCase() === prev.status.trim().toLowerCase(),
      );
      if (byName) {
        return {
          ...prev,
          hardware_status_id: byName.id,
          status: byName.name,
        };
      }
      if (!isEdit) {
        const inStock = hardwareStatuses.find((status) => status.name === "In Stock");
        if (inStock) {
          return {
            ...prev,
            hardware_status_id: inStock.id,
            status: inStock.name,
          };
        }
      }
      return prev;
    });
  }, [hardwareStatuses, isEdit]);

  useEffect(() => {
    if (duplicate || !initial?.id || !initial.is_active || !canFinancialView) return;
    client
      .get<CostRecord | null>(`/api/hardware/${initial.id}/hardware-cost`)
      .then((r) => {
        const cost = r.data;
        if (cost) {
          setForm((prev) => ({
            ...prev,
            purchase_year:
              cost.purchase_year != null ? String(cost.purchase_year) : "",
            purchase_cost: String(cost.amount),
          }));
        }
      })
      .catch(() => {});
  }, [initial?.id, initial?.is_active, canFinancialView, duplicate]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in fieldErrors) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as HardwareAssetFieldErrorKey];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const nextErrors = validateDraft(form, true);
    const trimmedSerial = form.serial_number.trim();
    const trimmedModel = form.model_name.trim();

    if (!isSimpleHardware(form.hardware_type) && !trimmedSerial) {
      nextErrors.serial_number = "Serial number is required.";
    }
    if (!trimmedModel) {
      nextErrors.model_name = "Model name is required.";
    }

    const pyRaw = form.purchase_year.trim();
    let purchaseYear: number | null = null;
    if (pyRaw) {
      const parsedYear = Number(pyRaw);
      if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
        nextErrors.purchase_year = "Purchase year must be between 1900 and 2100.";
      } else {
        purchaseYear = parsedYear;
      }
    }

    const costRaw = form.purchase_cost.trim();
    let purchaseCost = 0;
    if (costRaw) {
      const parsedCost = Number(costRaw);
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        nextErrors.purchase_cost = "Cost must be zero or greater.";
      } else {
        purchaseCost = parsedCost;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("Fix the highlighted fields and try again.");
      setSaving(false);
      return;
    }

    setFieldErrors({});

    const payload = draftToHardwareAssetPayload(form);

    try {
      if (isEdit && initial) {
        await client.put(`/api/hardware/${initial.id}`, payload);
        if (initial.is_active && canFinancialView) {
          await client.put(`/api/hardware/${initial.id}/hardware-cost`, {
            amount: purchaseCost,
            purchase_year: purchaseYear,
          });
        }
        navigate(`/hardware/${initial.id}`);
      } else {
        const res = await client.post<HardwareAsset>("/api/hardware/", payload);
        const hardwareId = res.data.id;
        if (canFinancialView) await client.put(`/api/hardware/${hardwareId}/hardware-cost`, {
          amount: purchaseCost,
          purchase_year: purchaseYear,
        });
        navigate(`/hardware/${hardwareId}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save hardware";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-200";
  const withError = (key: HardwareAssetFieldErrorKey) =>
    [
      inputCls,
      fieldErrors[key] ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "",
    ]
      .filter(Boolean)
      .join(" ");
  const sectionCardCls =
    "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm";

  const rowGridCls = "grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3";

  const showPurchaseFields = canFinancialView && (!isEdit || (initial?.is_active ?? false));

  function renderFieldControl(key: HardwareAssetFieldKey) {
    switch (key) {
      case "status":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.status}</label>
            <select
              className={inputCls}
              value={form.hardware_status_id}
              onChange={(e) => {
                const id = e.target.value;
                const row = hardwareStatuses.find((status) => status.id === id);
                setForm((prev) => ({
                  ...prev,
                  hardware_status_id: id,
                  status: row?.name ?? prev.status,
                }));
              }}
              disabled={hardwareStatuses.length === 0}
            >
              {hardwareStatuses.length === 0 ? (
                <option value="">Loading statuses…</option>
              ) : (
                hardwareStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))
              )}
            </select>
          </div>
        );
      case "assigned_to":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.assigned_to}</label>
            <select
              className={inputCls}
              value={form.assigned_to_id}
              onChange={(e) => set("assigned_to_id", e.target.value)}
            >
              <option value="">-- Unassigned --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        );
      case "location":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.location}</label>
            <select
              className={inputCls}
              value={form.hardware_location_id}
              onChange={(e) => set("hardware_location_id", e.target.value)}
            >
              <option value="">— None —</option>
              {hardwareLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        );
      case "cpu":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.cpu}</label>
            <input
              className={inputCls}
              value={form.cpu}
              onChange={(e) => set("cpu", e.target.value)}
            />
          </div>
        );
      case "ram":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.ram}</label>
            <input
              className={inputCls}
              value={form.ram}
              onChange={(e) => set("ram", e.target.value)}
            />
          </div>
        );
      case "storage_size":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.storage_size}</label>
            <input
              className={inputCls}
              value={form.storage_size}
              onChange={(e) => set("storage_size", e.target.value)}
            />
          </div>
        );
      case "purchase_year":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.purchase_year}</label>
            <input
              type="number"
              min={1900}
              max={2100}
              className={withError("purchase_year")}
              value={form.purchase_year}
              onChange={(e) => set("purchase_year", e.target.value)}
              placeholder="Optional"
            />
            {fieldErrors.purchase_year && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.purchase_year}</p>
            )}
          </div>
        );
      case "purchase_cost":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.purchase_cost}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={withError("purchase_cost")}
              value={form.purchase_cost}
              onChange={(e) => set("purchase_cost", e.target.value)}
              placeholder="Optional"
            />
            {fieldErrors.purchase_cost && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.purchase_cost}</p>
            )}
          </div>
        );
      case "notes":
        return (
          <div>
            <label className={labelCls}>{HARDWARE_FIELD_LABELS.notes}</label>
            <textarea
              className={inputCls}
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">
          {error}
        </div>
      )}

      <div className={sectionCardCls}>
        <HardwareTypeFields value={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} />
        {(["quantity", "imei", "imei2"] as const).map((key) => fieldErrors[key] && <p key={key} className="mt-2 text-sm text-danger">{fieldErrors[key]}</p>)}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Serial Number{isSimpleHardware(form.hardware_type) ? " (optional)" : " *"}</label>
            <input
              required={!isSimpleHardware(form.hardware_type)}
              className={withError("serial_number")}
              value={form.serial_number}
              onChange={(e) => set("serial_number", e.target.value)}
            />
            {fieldErrors.serial_number && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.serial_number}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Model Name *</label>
            <input
              required
              className={withError("model_name")}
              value={form.model_name}
              onChange={(e) => set("model_name", e.target.value)}
            />
            {fieldErrors.model_name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.model_name}</p>
            )}
          </div>

          {!isSimpleHardware(form.hardware_type) && <div>
            <label className={labelCls}>Operating system</label>
            <div className="flex items-center gap-2">
              <OsIcon
                operatingSystem={
                  form.operating_system
                    ? (form.operating_system as OperatingSystem)
                    : null
                }
                className="h-7 w-7 shrink-0"
              />
              <select
                className={`${inputCls} min-w-0 flex-1`}
                value={form.operating_system}
                onChange={(e) => set("operating_system", e.target.value)}
              >
                <option value="">— Unknown —</option>
                {osOptionsForType(form.hardware_type).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>}
        </div>

        {!isSimpleHardware(form.hardware_type) && <div className="mt-4 flex items-center">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={form.mdm_connected}
              onChange={(e) => set("mdm_connected", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
            />
            MDM Connected
          </label>
        </div>}
      </div>

      {HARDWARE_VIEW_SECTIONS.map((section) => {
        const visibleFields = section.fields.filter((key) => {
          if (isSimpleHardware(form.hardware_type) && ["cpu", "ram", "storage_size"].includes(key)) return false;
          if (key === "purchase_year" || key === "purchase_cost") {
            return showPurchaseFields;
          }
          return true;
        });

        if (visibleFields.length === 0) {
          return null;
        }

        return (
          <div key={section.id} className={sectionCardCls}>
            <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              {section.title}
            </h2>
            <div className={rowGridCls}>
              {visibleFields.map((key) => (
                <div
                  key={key}
                  className={key === "notes" ? "col-span-full" : undefined}
                >
                  {renderFieldControl(key)}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Create hardware asset"}
        </Button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
