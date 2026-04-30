import { Tag } from "@/components/opai-ds";
import type { TagVariant } from "@/components/opai-ds";

type Status =
  | "draft" | "sent" | "approved" | "rejected" | "viewed"
  | "open" | "won" | "lost" | "active" | "inactive"
  | "pending" | "in_review"
  | "postulante" | "seleccionado" | "contratado" | "te" | "inactivo"
  | "solicitado" | "en_curso" | "realizado" | "facturado"
  | "pendiente_aprobacion" | "rechazado"
  | "prospect" | "client_active" | "client_inactive";

interface StatusTagProps {
  status: Status | string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const STATUS_MAP: Record<Status, { label: string; variant: TagVariant }> = {
  draft:                { label: "Borrador", variant: "neutral" },
  sent:                 { label: "Enviada", variant: "info" },
  approved:             { label: "Aprobada", variant: "ok" },
  rejected:             { label: "Rechazada", variant: "danger" },
  viewed:               { label: "Vista", variant: "ok" },
  open:                 { label: "Abierto", variant: "info" },
  won:                  { label: "Ganado", variant: "ok" },
  lost:                 { label: "Perdido", variant: "danger" },
  active:               { label: "Activo", variant: "ok" },
  inactive:             { label: "Inactivo", variant: "neutral" },
  pending:              { label: "Pendiente", variant: "warn" },
  in_review:            { label: "En revisión", variant: "info" },
  postulante:           { label: "Postulante", variant: "neutral" },
  seleccionado:         { label: "Seleccionado", variant: "info" },
  contratado:           { label: "Contratado", variant: "ok" },
  te:                   { label: "Turno Extra", variant: "neutral" },
  inactivo:             { label: "Inactivo", variant: "warn" },
  pendiente_aprobacion: { label: "Pendiente aprobación", variant: "warn" },
  rechazado:            { label: "Rechazado", variant: "danger" },
  solicitado:           { label: "Solicitado", variant: "warn" },
  en_curso:             { label: "En curso", variant: "info" },
  realizado:            { label: "Realizado", variant: "ok" },
  facturado:            { label: "Facturado", variant: "neutral" },
  prospect:             { label: "Prospecto", variant: "warn" },
  client_active:        { label: "Cliente activo", variant: "ok" },
  client_inactive:      { label: "Cliente inactivo", variant: "neutral" },
};

/**
 * StatusTag — wrapper de Tag DS v3 con mapping automático de estados de Opai.
 * Reemplaza al StatusBadge legacy (@/components/opai/StatusBadge).
 */
export function StatusTag({ status, className, size = "sm" }: StatusTagProps) {
  const normalized = status.toLowerCase() as Status;
  const config = STATUS_MAP[normalized] ?? { label: status, variant: "neutral" as TagVariant };

  return (
    <Tag variant={config.variant} size={size} dot className={className}>
      {config.label}
    </Tag>
  );
}
