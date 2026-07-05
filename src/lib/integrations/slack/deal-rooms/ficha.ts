/**
 * Ficha viva del negocio (Fase 16) — la tarjeta fijada de una Deal Room.
 *
 * Cliente · monto · etapa · cotización activa · próxima tarea · owner, con
 * botones: Avanzar etapa · WhatsApp contacto · Nota · Abrir en OPAI. Se publica
 * al crear la sala (pins.add) y se re-edita con chat.update en cada cambio
 * relevante (B2). El data-loader es la única fuente; el renderer es puro.
 */

import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { clp, resolveDealWaUrl } from "../comercial/deal-common";

export interface DealCard {
  dealId: string;
  title: string;
  accountName: string;
  amount: number;
  stageName: string;
  status: string; // open | won | lost
  quoteLabel: string | null; // "Q-123 · enviada" | null
  nextTask: string | null; // "Llamar a Juan · vence 12-07" | null
  ownerName: string | null;
  contactPhone: string | null;
  contactFirst: string | null;
}

const dfmt = (d: Date | null): string => (d ? d.toLocaleDateString("es-CL") : "—");

const QUOTE_STATUS_ES: Record<string, string> = {
  draft: "borrador", sent: "enviada", viewed: "vista", accepted: "aceptada",
  approved: "aprobada", rejected: "rechazada", expired: "vencida",
};

/** Carga los datos de la ficha viva de un negocio (o null si no existe). */
export async function loadDealCard(tenantId: string, dealId: string): Promise<DealCard | null> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: {
      id: true, title: true, amount: true, status: true, activeQuotationId: true,
      account: { select: { name: true, ownerId: true } },
      stage: { select: { name: true } },
      primaryContact: { select: { firstName: true, phone: true } },
    },
  });
  if (!deal) return null;

  // Cotización activa (code + estado legible), si el deal la tiene marcada.
  let quoteLabel: string | null = null;
  if (deal.activeQuotationId) {
    const q = await prisma.cpqQuote
      .findFirst({ where: { id: deal.activeQuotationId, tenantId }, select: { code: true, status: true } })
      .catch(() => null);
    if (q) quoteLabel = `${q.code} · ${QUOTE_STATUS_ES[q.status] ?? q.status}`;
  }

  // Próxima tarea abierta del negocio (la de vencimiento más cercano).
  const task = await prisma.crmTask
    .findFirst({
      where: { tenantId, dealId, status: "open" },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      select: { title: true, dueAt: true },
    })
    .catch(() => null);
  const nextTask = task ? `${task.title}${task.dueAt ? ` · vence ${dfmt(task.dueAt)}` : ""}` : null;

  // Owner del negocio: OPAI no lo modela en el deal → cae en el owner de la cuenta.
  let ownerName: string | null = null;
  if (deal.account.ownerId) {
    const owner = await prisma.admin
      .findFirst({ where: { id: deal.account.ownerId, tenantId }, select: { name: true } })
      .catch(() => null);
    ownerName = owner?.name ?? null;
  }

  return {
    dealId: deal.id,
    title: deal.title,
    accountName: deal.account.name,
    amount: Number(deal.amount ?? 0),
    stageName: deal.stage.name,
    status: deal.status,
    quoteLabel,
    nextTask,
    ownerName,
    contactPhone: deal.primaryContact?.phone ?? null,
    contactFirst: deal.primaryContact?.firstName ?? null,
  };
}

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

/** Emoji de encabezado de la ficha según el estado del negocio. */
function statusEmoji(status: string): string {
  if (status === "won") return "🏆";
  if (status === "lost") return "🥀";
  return "📌";
}

/**
 * Construye los bloques de la ficha viva. `waUrl` se resuelve aparte (async) y
 * se pasa acá; si es null, no se pinta el botón de WhatsApp. `blocks` puros para
 * chat.postMessage (crear) y chat.update (refrescar).
 */
export function buildFichaBlocks(card: DealCard, waUrl: string | null): { text: string; blocks: unknown[] } {
  const base = getCanonicalSiteUrl();
  const fields: Array<{ label: string; value: string }> = [
    { label: "Cliente", value: card.accountName },
    { label: "Monto", value: card.amount ? clp(card.amount) : "—" },
    { label: "Etapa", value: card.stageName },
    { label: "Cotización activa", value: card.quoteLabel ?? "—" },
    { label: "Próxima tarea", value: card.nextTask ?? "—" },
    { label: "Owner", value: card.ownerName ?? "—" },
  ];

  const blocks: unknown[] = [
    { type: "header", text: pt(`${statusEmoji(card.status)} ${card.title}`.slice(0, 150)) },
    { type: "section", fields: fields.map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}` })) },
  ];

  // Fila de acciones. action_id ÚNICO por elemento (regla de Slack); los que
  // abren modal se rutean en interactivity.ts por prefijo `dealroom_`.
  const elements: unknown[] = [
    { type: "button", action_id: "dealroom_advance", value: card.dealId, text: pt("⏩ Avanzar etapa") },
  ];
  if (waUrl) elements.push({ type: "button", action_id: "dealroom_wa", url: waUrl, text: pt("🟢 WhatsApp") });
  elements.push({ type: "button", action_id: "dealroom_note", value: card.dealId, text: pt("📝 Nota") });
  elements.push({ type: "button", action_id: "dealroom_open", url: `${base}/crm/deals/${card.dealId}`, text: pt("Abrir en OPAI") });
  blocks.push({ type: "actions", block_id: `dealroom_ficha_${card.dealId}`, elements });

  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Ficha viva · se actualiza sola en cada cambio · OPAI" }] });

  const text = `${card.title} — ${card.accountName} · ${card.amount ? clp(card.amount) : ""} · ${card.stageName}`;
  return { text: text.slice(0, 300), blocks };
}

/** Conveniencia: carga la ficha + resuelve WhatsApp + arma los bloques. */
export async function renderFicha(tenantId: string, dealId: string): Promise<{ text: string; blocks: unknown[] } | null> {
  const card = await loadDealCard(tenantId, dealId);
  if (!card) return null;
  const waUrl = await resolveDealWaUrl(tenantId, dealId).catch(() => null);
  return buildFichaBlocks(card, waUrl);
}
