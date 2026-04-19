import { useOutletContext } from "react-router-dom";
import { Attachments } from "../components/Attachments";
import type { ServiceDetailContext } from "../service/serviceDetailContext";

export function ServiceAttachments() {
  const { service } = useOutletContext<ServiceDetailContext>();
  return (
    <div className="space-y-6">
      <Attachments entityType="service" entityId={service.id} />
    </div>
  );
}
