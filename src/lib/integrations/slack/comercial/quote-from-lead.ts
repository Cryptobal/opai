/**
 * Cotización en UN clic desde el lead (Fase 15, B2).
 *
 * Modal mínimo prellenado con lo que el lead ya trae (dotación/comuna, editable)
 * → llama al SERVICIO REAL `approveLeadToEntities` (el mismo motor de la web, por
 * eso el precio es idéntico) → devuelve una tarjeta por DM:
 *   CPQ-XXX · $X.XXX.XXX · [Ver PDF] [Enviar al cliente] [Editar en OPAI]
 * "Enviar al cliente" usa el flujo de envío existente (sendQuoteToPortal) y
 * dispara quote_sent. Nunca inventa precios: si al motor le falta config, avisa.
 */

import { prisma } from "@/lib/prisma";
import { canEdit } from "@/lib/permissions";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { approveLeadToEntities } from "@/lib/crm-lead-quote-engine";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackOpenDm, slackPostMessage, slackRespondUrl } from "../api";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import { leadDisplayName } from "./lead-actions";
import type { ModalDef, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });
const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n));

/** Total de dotación guardado en el lead (metadata.totalGuards o suma de dotacion). */
function leadTotalGuards(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const m = metadata as { totalGuards?: unknown; dotacion?: Array<{ cantidad?: unknown; numPuestos?: unknown }> };
  if (typeof m.totalGuards === "number" && m.totalGuards > 0) return m.totalGuards;
  if (Array.isArray(m.dotacion)) {
    return m.dotacion.reduce((s, d) => s + (Number(d?.cantidad) || 0) * (Number(d?.numPuestos) || 1), 0);
  }
  return 0;
}

/** Construye el modal de cotización prellenado desde el lead (async: carga el lead). */
export async function buildCotizarView(tenantId: string, leadId: string): Promise<SlackView> {
  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, tenantId },
    select: { firstName: true, lastName: true, companyName: true, commune: true, preferredShift: true, metadata: true },
  });
  const name = lead ? leadDisplayName(lead) : "Lead";
  const guards = lead ? leadTotalGuards(lead.metadata) : 0;
  const instName = lead?.companyName?.trim() || name;
  const input = (block: string, label: string, initial?: string, optional = false) => ({
    type: "input", block_id: block, optional, label: pt(label),
    element: { type: "plain_text_input", action_id: "v", ...(initial ? { initial_value: initial } : {}) },
  });
  return {
    type: "modal",
    callback_id: "leadquote_new",
    private_metadata: packMetadata({ kind: "lead_quote", leadId }),
    title: modalTitle("Cotizar lead"),
    submit: pt("Generar"),
    close: pt("Cancelar"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `Cotización rápida para *${name}*. Ajusta lo que falte; el precio sale del mismo motor que la web.` } },
      input("instname", "Instalación", instName),
      input("guards", "Dotación (N.º de guardias)", guards > 0 ? String(guards) : undefined),
      input("puestos", "Puestos", "1"),
      input("comuna", "Comuna", lead?.commune ?? undefined, true),
    ],
  };
}

/** Tarjeta-resultado con acciones (Ver PDF · Enviar · Editar). */
function quoteResultCard(leadName: string, quotes: Array<{ id: string; code: string; amount: number }>): { text: string; blocks: unknown[] } {
  const site = getCanonicalSiteUrl();
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "✅ Cotización lista", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `Desde el lead *${leadName}*:` } },
  ];
  for (const q of quotes) {
    blocks.push(
      { type: "section", text: { type: "mrkdwn", text: `*${q.code}* · *${clp(q.amount)}/mes*` } },
      {
        type: "actions",
        block_id: `opai_quoteres_${q.id}`,
        elements: [
          { type: "button", action_id: "quotecard_pdf", url: `${site}/api/cpq/quotes/${q.id}/proposal-pdf`, text: pt("📄 Ver PDF") },
          { type: "button", action_id: "quotecard_send", value: q.id, style: "primary", text: pt("✉️ Enviar al cliente") },
          { type: "button", action_id: "quotecard_edit", url: `${site}/crm/cotizaciones/${q.id}`, text: pt("✏️ Editar en OPAI") },
        ],
      },
    );
  }
  return { text: `Cotización lista para ${leadName}`, blocks };
}

/** DM best-effort al usuario que generó la cotización. */
async function dmUser(botToken: string, slackUserId: string, text: string, blocks?: unknown[]): Promise<void> {
  const dm = await slackOpenDm(botToken, slackUserId);
  if (!dm) return;
  await slackPostMessage(botToken, { channel: dm, text, blocks }).catch(() => {});
}

export const cotizarLeadModal: ModalDef = {
  callbackId: "leadquote_new",
  title: "Cotizar lead",
  requires: (perms) => canEdit(perms, "crm", "quotes") || canEdit(perms, "cpq"),
  requiresMessage: "Necesitas permiso para crear cotizaciones (CRM/CPQ).",
  build: () => buildCotizarView("", ""), // fallback; el open real prellena por leadId
  submit: async (ctx: ModalSubmitContext): Promise<ModalSubmitResult> => {
    const leadId = ctx.metadata.leadId ?? "";
    const guards = parseInt((ctx.state.guards?.v?.value ?? "").trim(), 10);
    const puestos = parseInt((ctx.state.puestos?.v?.value ?? "1").trim(), 10) || 1;
    const instName = (ctx.state.instname?.v?.value ?? "").trim();
    const comuna = (ctx.state.comuna?.v?.value ?? "").trim();
    if (!leadId) return { ack: { response_action: "errors", errors: { guards: "Lead no válido." } } };
    if (!Number.isFinite(guards) || guards < 1) return { ack: { response_action: "errors", errors: { guards: "Indica cuántos guardias (número ≥ 1)." } } };

    const slackUserId = ctx.slackUserId;
    const botToken = ctx.workspace.botToken;
    const tenantId = ctx.tenantId;
    const userId = ctx.linked.adminId;

    const work = async () => {
      const lead = await prisma.crmLead.findFirst({ where: { id: leadId, tenantId }, select: { firstName: true, lastName: true, companyName: true, city: true, address: true } });
      const leadName = lead ? leadDisplayName(lead) : "lead";
      const body = {
        installations: [{
          name: instName || lead?.companyName || "Instalación",
          commune: comuna || undefined,
          city: lead?.city ?? undefined,
          address: lead?.address ?? undefined,
          dotacion: [{ puesto: "Guardia de Seguridad", cantidad: guards, numPuestos: puestos, dias: [] }],
        }],
      };
      const result = await approveLeadToEntities({ tenantId, userId, leadId, body });
      if (result.kind !== "ok") {
        const reason =
          result.kind === "already_approved" ? "el lead ya estaba aprobado"
          : result.kind === "no_pipeline" ? "no hay etapas de pipeline configuradas"
          : result.kind === "tx_aborted" || result.kind === "bad_request" || result.kind === "error" ? result.error
          : "no se pudo generar";
        await dmUser(botToken, slackUserId, `⚠️ No pude cotizar *${leadName}*: ${reason}. Puedes hacerlo en OPAI.`);
        return;
      }
      const quotes = result.data.quotes ?? [];
      if (quotes.length === 0) {
        await dmUser(botToken, slackUserId, `⚠️ No se creó cotización para *${leadName}* (¿el lead trae dotación?). Revisa en OPAI.`);
        return;
      }
      const withAmounts = await Promise.all(quotes.map(async (q) => {
        const row = await prisma.cpqQuote.findFirst({ where: { id: q.id, tenantId }, select: { monthlyCost: true, parameters: { select: { salePriceMonthly: true } } } });
        const amount = Number(row?.parameters?.salePriceMonthly ?? 0) || Number(row?.monthlyCost ?? 0);
        return { id: q.id, code: q.code, amount };
      }));
      const card = quoteResultCard(leadName, withAmounts);
      await dmUser(botToken, slackUserId, card.text, card.blocks);
    };

    return { ack: {}, work };
  },
};

/** Enviar al cliente (quotecard_send): usa el flujo de envío real y dispara quote_sent. */
export async function handleQuoteCardAction(payload: {
  team?: { id?: string };
  user?: { id?: string };
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  if (!teamId || !slackUserId || action?.action_id !== "quotecard_send" || !action.value) return;
  const quoteId = action.value;
  const responseUrl = payload.response_url;
  const ephemeral = (text: string) => (responseUrl ? slackRespondUrl(responseUrl, { response_type: "ephemeral", text }) : Promise.resolve());

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  if (!canEdit(linked.perms, "crm", "quotes") && !canEdit(linked.perms, "cpq")) {
    await ephemeral("No tienes permiso para enviar cotizaciones.");
    return;
  }
  const tenantId = workspace.tenantId;

  try {
    const { sendQuoteToPortal } = await import("@/modules/cpq/send/send-quote-to-portal");
    const res = await sendQuoteToPortal({ quoteId, tenantId, userId: linked.adminId, followUp: { include: true, targetStageId: null } });
    // Activa el evento de catálogo quote_sent (antes solo quedaba el history log).
    const quote = await prisma.cpqQuote.findFirst({ where: { id: quoteId, tenantId }, select: { code: true, dealId: true, monthlyCost: true, parameters: { select: { salePriceMonthly: true } } } });
    const monto = Number(quote?.parameters?.salePriceMonthly ?? 0) || Number(quote?.monthlyCost ?? 0);
    const { notify } = await import("@/lib/notifications/notify");
    await notify({
      tenantId,
      type: "quote_sent",
      title: `Cotización enviada: ${quote?.code ?? quoteId}`,
      body: `${res.contactName || res.sentTo} · ${monto ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(monto) : ""}`.trim(),
      link: quote?.dealId ? `/crm/deals/${quote.dealId}` : `/crm/cotizaciones/${quoteId}`,
      data: { quoteId, dealId: quote?.dealId ?? undefined, contacto: res.contactName, phone: res.whatsappPhone },
    }).catch((e) => console.error("[slack] quote_sent notify:", e));
    await ephemeral(`✉️ Cotización *${quote?.code ?? ""}* enviada a ${res.sentTo}.`);
  } catch (err) {
    await ephemeral(`⚠️ No se pudo enviar: ${err instanceof Error ? err.message : "error"}`);
  }
}
