"use client";

const EVENT_TYPE_LABEL: Record<string, string> = {
  lifecycle_changed: "Cambio de estado",
  document_uploaded: "Documento subido",
  document_updated: "Documento actualizado",
  document_deleted: "Documento eliminado",
  bank_account_created: "Cuenta bancaria creada",
  bank_account_updated: "Cuenta bancaria actualizada",
  bank_account_deleted: "Cuenta bancaria eliminada",
  status_changed: "Cambio de estado",
  assigned: "Asignado a puesto",
  unassigned: "Desasignado de puesto",
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

export default function HistorialSection({ historyEvents }: HistorialSectionProps) {
  return (
    <div className="space-y-2">
      {historyEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
      ) : (
        historyEvents.map((event) => (
          <div key={event.id} className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">{EVENT_TYPE_LABEL[event.eventType] || event.eventType}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(event.createdAt).toLocaleString("es-CL")}
              {event.createdByName ? ` · por ${event.createdByName}` : ""}
              {event.reason ? ` · ${event.reason}` : ""}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
