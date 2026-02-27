"use client";

import { cn } from "@/lib/utils";

const EVENT_TYPE_LABEL: Record<string, string> = {
  lifecycle_changed: "Cambio de estado",
  status_changed: "Cambio de estado",
  document_uploaded: "Documento subido",
  document_updated: "Documento actualizado",
  document_deleted: "Documento eliminado",
  bank_account_created: "Cuenta bancaria creada",
  bank_account_updated: "Cuenta bancaria actualizada",
  bank_account_deleted: "Cuenta bancaria eliminada",
  assigned: "Asignado a puesto",
  unassigned: "Desasignado de puesto",
  public_postulation_submitted: "Postulación recibida",
  postulation_submitted: "Postulación recibida",
  contract_generated: "Contrato generado",
  contract_signed: "Contrato firmado",
  salary_updated: "Sueldo actualizado",
  pin_generated: "PIN de marcación generado",
  pin_updated: "PIN de marcación actualizado",
  communication_sent: "Comunicación enviada",
  note_added: "Nota agregada",
  personal_data_updated: "Datos personales actualizados",
  rehired: "Recontratado",
};

const EVENT_NODE_COLOR: Record<string, string> = {
  lifecycle_changed: "bg-emerald-500",
  status_changed: "bg-emerald-500",
  public_postulation_submitted: "bg-violet-500",
  postulation_submitted: "bg-violet-500",
  document_uploaded: "bg-blue-500",
  document_updated: "bg-blue-500",
  document_deleted: "bg-red-500",
  assigned: "bg-cyan-500",
  unassigned: "bg-amber-500",
  contract_generated: "bg-indigo-500",
  contract_signed: "bg-emerald-500",
  rehired: "bg-emerald-500",
};

const LIFECYCLE_STATUS_LABEL: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado: "Contratado",
  te: "Turno Extra",
  inactivo: "Inactivo",
};

type HistoryEvent = {
  id: string;
  eventType: string;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

interface HistorialSectionProps {
  historyEvents: HistoryEvent[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${minutes}`;
}

function getEventDescription(event: HistoryEvent): string | null {
  const { eventType, newValue } = event;

  if ((eventType === "lifecycle_changed" || eventType === "status_changed") && newValue) {
    const from = newValue.from as string | undefined;
    const to = newValue.to as string | undefined;
    if (from && to) {
      const fromLabel = LIFECYCLE_STATUS_LABEL[from] || from;
      const toLabel = LIFECYCLE_STATUS_LABEL[to] || to;
      return `${fromLabel} → ${toLabel}`;
    }
    if (to) return `→ ${LIFECYCLE_STATUS_LABEL[to] || to}`;
  }

  if (eventType === "public_postulation_submitted" || eventType === "postulation_submitted") {
    return "Ingreso vía formulario público";
  }

  if (eventType === "assigned" && newValue) {
    const installation = newValue.installationName as string | undefined;
    const puesto = newValue.puestoName as string | undefined;
    if (installation && puesto) return `${puesto} en ${installation}`;
    if (installation) return installation;
  }

  if (eventType === "unassigned" && newValue) {
    const installation = newValue.installationName as string | undefined;
    if (installation) return installation;
  }

  if (eventType === "document_uploaded" && newValue) {
    const docType = newValue.documentType as string | undefined;
    if (docType) return docType;
  }

  if (event.reason) return event.reason;

  return null;
}

export default function HistorialSection({ historyEvents }: HistorialSectionProps) {
  if (historyEvents.length === 0) {
    return <p className="text-sm text-[#7a8a9e] py-1">Sin eventos registrados.</p>;
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[#1a2332]" />

      {historyEvents.map((event, idx) => {
        const label = EVENT_TYPE_LABEL[event.eventType] || event.eventType.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const nodeColor = EVENT_NODE_COLOR[event.eventType] || "bg-[#4a5568]";
        const description = getEventDescription(event);

        return (
          <div key={event.id} className={cn("relative pb-4", idx === historyEvents.length - 1 && "pb-0")}>
            {/* Node circle */}
            <div className={cn("absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-[#0a0e14]", nodeColor)} />

            <div className="min-w-0">
              <p className="text-sm font-medium text-[#e8edf4]">{label}</p>
              {description && (
                <p className="text-xs text-[#7a8a9e] mt-0.5">{description}</p>
              )}
              <p className="text-[11px] text-[#4a5568] mt-0.5">
                {formatDate(event.createdAt)}
                {event.createdByName ? ` · por ${event.createdByName}` : event.createdBy === "system" ? " · por Sistema" : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
