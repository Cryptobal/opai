"use client";

type CrmActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

export const ACTION_LABELS: Record<string, string> = {
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
  quote_sent_portal: "Cotización enviada por portal",
  quote_pdf_sent: "PDF enviado por email",
  quote_created: "Cotización creada",
  quote_updated: "Cotización actualizada",
  quote_deleted: "Cotización eliminada",
  quote_cloned: "Cotización clonada",
  quote_position_added: "Puesto agregado",
  quote_position_updated: "Puesto actualizado",
  quote_position_deleted: "Puesto eliminado",
  quote_position_cloned: "Puesto clonado",
  quote_costs_updated: "Costos y parámetros actualizados",
  quote_includes_updated: "Ítems incluidos actualizados",
  quote_margin_updated: "Margen actualizado",
  quote_attachment_added: "Adjunto agregado",
  quote_attachment_deleted: "Adjunto eliminado",
  quote_ai_description: "Descripción generada con IA",
  quote_ai_service_detail: "Detalle de servicio generado con IA",
  quote_approved: "Cotización aprobada por cliente",
  quote_rejected: "Cotización rechazada por cliente",
  quote_visita_tecnica_programada: "Visita técnica programada",
  presentation_sent: "Presentación enviada",
  portal_cliente_access: "Acceso al portal del cliente",
  visita_tecnica_programada: "Visita técnica programada",
};

const DOT_COLOR_BY_ACTION: Record<string, string> = {
  account_created: "bg-status-ok",
  account_updated: "bg-status-info",
  account_deleted: "bg-status-danger",
  contact_created: "bg-status-ok",
  contact_updated: "bg-status-info",
  contact_deleted: "bg-status-danger",
  deal_created: "bg-status-ok",
  deal_updated: "bg-status-info",
  deal_deleted: "bg-status-danger",
  deal_stage_changed: "bg-violet-500",
  deal_quote_linked: "bg-status-info",
  installation_created: "bg-status-ok",
  installation_updated: "bg-status-info",
  installation_deleted: "bg-status-danger",
  quote_sent: "bg-status-info",
  quote_sent_portal: "bg-status-info",
  quote_pdf_sent: "bg-status-info",
  quote_created: "bg-status-ok",
  quote_updated: "bg-status-info",
  quote_deleted: "bg-status-danger",
  quote_cloned: "bg-status-info",
  quote_position_added: "bg-status-ok",
  quote_position_updated: "bg-status-info",
  quote_position_deleted: "bg-status-danger",
  quote_position_cloned: "bg-status-info",
  quote_costs_updated: "bg-status-info",
  quote_includes_updated: "bg-status-info",
  quote_margin_updated: "bg-status-info",
  quote_attachment_added: "bg-status-ok",
  quote_attachment_deleted: "bg-status-danger",
  quote_ai_description: "bg-violet-500",
  quote_ai_service_detail: "bg-violet-500",
  quote_approved: "bg-status-ok",
  quote_rejected: "bg-status-danger",
  presentation_sent: "bg-status-info",
  portal_cliente_access: "bg-status-info",
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

  const subject = typeof details.subject === "string" ? details.subject : null;
  if (subject) lines.push(`Asunto: ${subject}`);

  const fromStage = typeof details.fromStageName === "string" ? details.fromStageName : null;
  const toStage = typeof details.toStageName === "string" ? details.toStageName : null;
  if (fromStage || toStage) lines.push(`${fromStage || "Sin etapa"} -> ${toStage || "Sin etapa"}`);

  const contactName = typeof details.contactName === "string" ? details.contactName : null;
  if (contactName) lines.push(`Contacto: ${contactName}`);
  const ip = typeof details.ip === "string" ? details.ip : null;
  if (ip) lines.push(`IP: ${ip}`);

  const code = typeof details.code === "string" ? details.code : null;
  if (code) lines.push(`Código: ${code}`);
  const sourceCode = typeof details.sourceCode === "string" ? details.sourceCode : null;
  if (sourceCode) lines.push(`Origen: ${sourceCode}`);
  const fileName = typeof details.fileName === "string" ? details.fileName : null;
  if (fileName) lines.push(`Archivo: ${fileName}`);
  const positionId = details.positionId ?? null;
  if (positionId) lines.push(`Puesto ID: ${positionId}`);
  const summary = typeof details.summary === "string" ? details.summary : null;
  if (summary) lines.push(summary);

  const changes = details.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes && typeof changes === "object" && Object.keys(changes).length > 0) {
    const changeLines = Object.entries(changes).map(
      ([field, v]) => `${field}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`
    );
    lines.push(...changeLines);
  }

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
                  : (event.details as Record<string, unknown>)?.source === "portal_cliente"
                    ? " · por Cliente (portal)"
                    : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}
