import type { CorreoDetail, CorreoThreadDTO } from "./correos.types";

/**
 * Proyecta el detalle del lector a un `CorreoThreadDTO` mínimo para acciones
 * del Copiloto (Armar licitación, menú IA, etc.).
 *
 * Sirve cuando el hilo está abierto pero no figura en la página actual de la
 * lista (búsqueda, deep-link, paginación, hardRefresh).
 */
export function threadDtoFromDetail(detail: CorreoDetail): CorreoThreadDTO {
  const t = detail.thread;
  const fromEmail =
    detail.messages.find((m) => m.direction === "inbound")?.fromEmail ??
    detail.messages[0]?.fromEmail ??
    null;

  return {
    id: t.id,
    subject: t.subject ?? "",
    fromEmail,
    snippet: null,
    lastMessageAt: t.lastMessageAt,
    emailAccountId: null,
    accountId: t.accountId,
    accountName: t.accountName,
    dealId: t.dealId,
    dealTitle: t.dealTitle,
    dealStageName: t.dealStageName,
    leadId: t.leadId,
    attachmentCount: detail.attachments.length,
    messageCount: detail.messages.length,
    providerThreadId: t.providerThreadId,
    possibleLead: false,
    isUnread: t.isUnread,
    archivedAt: t.archivedAt,
    trashedAt: t.trashedAt,
    snoozedUntil: t.snoozedUntil,
    starredAt: t.starredAt,
    spamAt: t.spamAt,
    hasDraft: detail.messages.some((m) => m.isDraft),
    pendingSince: null,
    slaLevel: null,
    slaLabel: null,
    openTaskCount: 0,
    taskDueLevel: null,
  };
}
