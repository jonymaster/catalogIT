import { useOutletContext } from "react-router-dom";
import { Attachments } from "../components/Attachments";
import type { HardwareAssetDetailOutletContext } from "./HardwareAssetOverview";

export function HardwareAssetAttachments() {
  const { hardware } = useOutletContext<HardwareAssetDetailOutletContext>();
  return <Attachments entityType="hardware" entityId={hardware.id} />;
}
