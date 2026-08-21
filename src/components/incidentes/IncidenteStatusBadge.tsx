import { Tag, type TagVariant } from "@/components/opai-ds";
import { incidenteStatusView, type IncidenteStatusTone } from "@/lib/incidentes-instalacion/status";

const TONE: Record<IncidenteStatusTone, TagVariant> = {
  info: "info",
  warn: "warn",
  ok: "ok",
  neutral: "brand",
};

export function IncidenteStatusBadge({ status }: { status: string }) {
  const view = incidenteStatusView(status);
  return (
    <Tag variant={TONE[view.tone]} size="sm">
      {view.label}
    </Tag>
  );
}
