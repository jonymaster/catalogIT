import type { HardwareType } from "../types/models";
import { OS_OPTIONS } from "../utils/operatingSystem";

export const HARDWARE_TYPES: { value: HardwareType; label: string }[] = [
  { value: "laptop", label: "Laptop" },
  { value: "phone", label: "Phone" },
  { value: "tablet", label: "Tablet" },
  { value: "accessory", label: "Accessory" },
  { value: "peripheral", label: "Peripheral" },
];
export const hardwareTypeLabel = (type: HardwareType) => HARDWARE_TYPES.find((row) => row.value === type)?.label ?? type;
export const isSimpleHardware = (type: HardwareType) => type === "accessory" || type === "peripheral";
export const isMobileHardware = (type: HardwareType) => type === "phone" || type === "tablet";
const operatingSystems: Record<HardwareType, string[]> = {
  laptop: ["macos", "windows", "linux"], phone: ["android", "ios"],
  tablet: ["android", "ipados", "windows", "linux"], accessory: [], peripheral: [],
};
export const osOptionsForType = (type: HardwareType) => OS_OPTIONS.filter((os) => operatingSystems[type].includes(os.value));

/** Explicit type changes clear fields that no longer apply. */
export function hardwareTypeChange(type: HardwareType, currentOs: string) {
  return {
    hardware_type: type,
    quantity: 1,
    operating_system: operatingSystems[type].includes(currentOs) ? currentOs : "",
    ...(isSimpleHardware(type) ? { cpu: "", ram: "", storage_size: "", os_version: "", mdm_connected: false } : {}),
    ...(!isMobileHardware(type) ? { imei: "", imei2: "", phone_number: "" } : {}),
  };
}
