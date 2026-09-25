import type { HardwareAssetDraft } from "../service/hardwareDetailContext";
import type { HardwareType } from "../types/models";
import { HARDWARE_TYPES, hardwareTypeChange, isMobileHardware, isSimpleHardware } from "../hardware/hardwareTypes";

type Fields = Pick<HardwareAssetDraft, "hardware_type" | "quantity" | "operating_system" | "os_version" | "imei" | "imei2" | "phone_number">;
export function HardwareTypeFields({ value, onChange, disabled = false }: {
  value: Fields;
  onChange: (patch: Partial<HardwareAssetDraft>) => void;
  disabled?: boolean;
}) {
  const inputClass = "mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg disabled:opacity-70";
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-sm text-fg-2">Hardware type
      <select aria-label="Hardware type" className={inputClass} value={value.hardware_type} disabled={disabled}
        onChange={(event) => onChange(hardwareTypeChange(event.target.value as HardwareType, value.operating_system))}>
        {HARDWARE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
    </label>
    {value.hardware_type === "accessory" && <label className="text-sm text-fg-2">Quantity
      <input aria-label="Quantity" className={inputClass} type="number" min={1} max={2147483647} step={1} required disabled={disabled} value={value.quantity}
        onChange={(event) => onChange({ quantity: Number(event.target.value) })} />
      <span className="mt-1 block text-xs text-fg-3">This batch shares its location and assignment. Purchase cost is the total for the batch.</span>
    </label>}
    {!isSimpleHardware(value.hardware_type) && <label className="text-sm text-fg-2">OS version
      <input aria-label="OS version" className={inputClass} maxLength={100} disabled={disabled} value={value.os_version}
        onChange={(event) => onChange({ os_version: event.target.value })} />
    </label>}
    {isMobileHardware(value.hardware_type) && (["imei", "imei2", "phone_number"] as const).map((key) => <label key={key} className="text-sm text-fg-2">
      {{ imei: "IMEI (optional)", imei2: "Second IMEI (optional)", phone_number: "Phone number (optional)" }[key]}
      <input aria-label={key === "imei" ? "IMEI" : key === "imei2" ? "Second IMEI" : "Phone number"} className={inputClass} disabled={disabled} value={value[key]}
        inputMode={key === "phone_number" ? "tel" : "numeric"} pattern={key === "phone_number" ? undefined : "[0-9]{15}"}
        maxLength={key === "phone_number" ? 50 : 15} onChange={(event) => onChange({ [key]: event.target.value })} />
    </label>)}
  </div>;
}
