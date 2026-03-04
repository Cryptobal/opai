"use client";

type CrmActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  account_created: "Cuenta creada",
  account_updated: "Cuenta actualizada",
  account_deleted: "Cuenta eliminada",
  contact_created: "Contacto creado",
  contact_updated: "Contacto actualizado",
  contact_deleted: "Contacto eliminado",
  deal_created: "Negocio creado",
  deal_updated: "Negocio actualizado",
  deal_deleted: "Negocio eliminado",
  deal_stage_changed: "Etapa de negocio cambiada",
  deal_quote_linked: "Cotización vinculada",
  installation_created: "Instalación creada",
  installation_updated: "Instalación actualizada",
  installation_deleted: "Instalación eliminada",
  quote_sent: "Cotización enviada",
};

const DOT_COLOR_BY_ACTION: Record<string, string> = {
  account_created: "bg-emerald-500",
  account_updated: "bg-blue-500",
  account_deleted: "bg-red-500",
  contact_created: "bg-emerald-500",
  contact_updated: "bg-blue-500",
  contact_deleted: "bg-red-500",
  deal_created: "bg-emerald-500",
  deal_updated: "bg-blue-500",
  deal_deleted: "bg-red-500",
  deal_stage_changed: "bg-violet-500",
  deal_quote_linked: "bg-cyan-500",
  installation_created: "bg-emerald-500",
  installation_updated: "bg-blue-500",
  installation_deleted: "bg-red-500",
  quote_sent: "bg-indigo-500",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDetailLines(event: CrmActivityEvent): string[] {
  const details = event.details || {};
  const lines: string[] = [];

  const changedFields = Array.isArray(details.changedFields)
    ? (details.changedFields as string[])
    : [];
  if (changedFields.length > 0) {
    lines.push(`Campos: ${changedFields.join(", ")}`);
  }

  const reason = typeof details.reason === "string" ? details.reason : null;
  if (reason) lines.push(reason);

  const quoteCode = typeof details.quoteCode === "string" ? details.quoteCode : null;
  if (quoteCode) lines.push(`Cotización: ${quoteCode}`);

  const to = typeof details.to === "string" ? details.to : null;
  if (to) lines.push(`Destino: ${to}`);

  const fromStage = typeof details.fromStageName === "string" ? details.fromStageName : null;
  const toStage = typeof details.toStageName === "string" ? details.toStageName : null;
  if (fromStage || toStage) lines.push(`${fromStage || "Sin etapa"} -> ${toStage || "Sin etapa"}`);

  return lines;
}

export function CrmActivityTimeline({ events }: { events: CrmActivityEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>;
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
      {events.map((event, index) => {
        const lines = formatDetailLines(event);
        const label =
          ACTION_LABELS[event.action] ||
          event.action.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
        const dotColor = DOT_COLOR_BY_ACTION[event.action] || "bg-muted-foreground";

        return (
          <div key={event.id} className={`relative ${index === events.length - 1 ? "" : "pb-4"}`}>
            <div className={`absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-background ${dotColor}`} />
            <p className="text-sm font-medium text-foreground">{label}</p>
            {lines.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {lines.map((line, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatDate(event.createdAt)}
              {event.createdByName
                ? ` · por ${event.createdByName}`
                : event.createdBy === "system"
                  ? " · por Sistema"
                  : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}
