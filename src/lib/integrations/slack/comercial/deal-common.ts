/**
 * Helpers compartidos de acciones de deal para el pipeline en Slack (Fase 15, B4):
 * WhatsApp de seguimiento, nota rápida (CrmNote), y Ganado/Perdido usando el
 * servicio real de cambio de etapa (`changeDealStage`, que además emite deal_won).
 */

import { prisma } from "@/lib/prisma";
import { getWaTemplate } from "@/lib/whatsapp-templates";
import { changeDealStage } from "@/lib/crm/change-deal-stage";
import { normalizeWaPhone } from "./lead-actions";

export const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n || 0));

/** URL wa.me de seguimiento para el contacto del deal (o null sin teléfono). */
export async function resolveDealWaUrl(
  tenantId: string,
  d: { contactPhone?: string | null; contactFirst?: string | null; accountName?: string | null },
): Promise<string | null> {
  const phone = normalizeWaPhone(d.contactPhone);
  if (!phone) return null;
  const msg = await getWaTemplate(tenantId, "followup_first", {
    entities: { contact: { firstName: d.contactFirst ?? "" }, account: { name: d.accountName ?? "" } },
  }).catch(() => "");
  return `https://wa.me/${phone}?text=${encodeURIComponent((msg ?? "").trim())}`;
}

/** Nota rápida sobre un deal (CrmNote entityType="deal"). */
export async function addDealNote(tenantId: string, adminId: string, dealId: string, content: string): Promise<void> {
  await prisma.crmNote.create({ data: { tenantId, entityType: "deal", entityId: dealId, content, mentions: [], createdBy: adminId } });
}

/** Marca el deal como ganado (etapa isClosedWon; el servicio emite deal_won → 🎉). */
export async function markDealWon(tenantId: string, userId: string, dealId: string): Promise<{ ok: boolean; error?: string }> {
  const won = await prisma.crmPipelineStage.findFirst({ where: { tenantId, isActive: true, isClosedWon: true } });
  if (!won) return { ok: false, error: "No hay etapa de cierre ganado configurada." };
  const r = await changeDealStage({ tenantId, userId, dealId, stageId: won.id });
  return r.kind === "ok" ? { ok: true } : { ok: false, error: "No se pudo marcar ganado." };
}

/** Marca el deal como perdido (etapa isClosedLost) + guarda motivo + nota. */
export async function markDealLost(tenantId: string, userId: string, dealId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const lost = await prisma.crmPipelineStage.findFirst({ where: { tenantId, isActive: true, isClosedLost: true } });
  if (!lost) return { ok: false, error: "No hay etapa de cierre perdido configurada." };
  const r = await changeDealStage({ tenantId, userId, dealId, stageId: lost.id });
  if (r.kind !== "ok") return { ok: false, error: "No se pudo marcar perdido." };
  await prisma.crmDeal.update({ where: { id: dealId }, data: { lostReason: reason } }).catch(() => {});
  await addDealNote(tenantId, userId, dealId, `Perdido: ${reason}`).catch(() => {});
  return { ok: true };
}
