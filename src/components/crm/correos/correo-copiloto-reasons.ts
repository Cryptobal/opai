import type { CorreoDetail } from "@/modules/crm/email/correos.types";

/**
 * Pendientes de Copiloto para un hilo (compartido por el badge del botón
 * desktop y el banner móvil). Motivos: hilo sin cuenta, adjuntos sin guardar,
 * urgencia alta sin negocio y adjuntos no cargados (`degraded`).
 */
export function copilotoAttentionReasons(detail: CorreoDetail): string[] {
  const t = detail.thread;
  const reasons: string[] = [];
  if (t.accountId == null) reasons.push("sin cuenta asociada");
  if (detail.attachments.some((a) => !a.savedFileId)) reasons.push("adjuntos sin guardar");
  if (t.aiUrgency === "alta" && !t.dealId) reasons.push("urgencia alta sin negocio");
  if (detail.degraded) reasons.push("adjuntos no cargados");
  return reasons;
}
