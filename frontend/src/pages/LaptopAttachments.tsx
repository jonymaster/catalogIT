import { useOutletContext } from "react-router-dom";
import { Attachments } from "../components/Attachments";
import type { LaptopDetailOutletContext } from "./LaptopOverview";

export function LaptopAttachments() {
  const { laptop } = useOutletContext<LaptopDetailOutletContext>();
  return <Attachments entityType="laptop" entityId={laptop.id} />;
}
