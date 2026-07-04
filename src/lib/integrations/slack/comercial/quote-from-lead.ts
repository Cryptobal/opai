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
interface DotEntry { puesto: string; cantidad: number; numPuestos: number }

/** Dotación estructurada del lead (del cotizador público). Vacío = lead sin datos. */
function parseDotacion(metadata: unknown): DotEntry[] {
  if (!metadata || typeof metadata !== "object") return [];
  const arr = (metadata as { dotacion?: unknown }).dotacion;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((d) => ({
      puesto: typeof (d as { puesto?: unknown })?.puesto === "string" ? (d as { puesto: string }).puesto : "Guardia de Seguridad",
      cantidad: Number((d as { cantidad?: unknown })?.cantidad) || 1,
      numPuestos: Number((d as { numPuestos?: unknown })?.numPuestos) || 1,
    }))
    .filter((d) => d.cantidad > 0);
}

/** Modal-fallback cuando el lead NO trae datos estructurados: manda al cockpit web. */
function convertFallbackView(name: string, convertUrl: string): SlackView {
  return {
    type: "modal",
    callback_id: "leadquote_fallback",
    title: modalTitle("Cotizar lead"),
    close: pt("Cerrar"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${name}* no trae datos estructurados de dotación, así que no puedo cotizar exprés sin inventar precios.\n\nÁbrelo en OPAI para convertirlo con el cockpit completo (cuenta, instalación con mapa, líneas y condiciones).` } },
      { type: "actions", elements: [{ type: "button", action_id: "leadquote_convert", url: convertUrl, style: "primary", text: pt("📝 Convertir en OPAI") }] },
    ],
  };
}

/**
 * Modal de cotización desde el lead (Fase 15, B2 · dos velocidades):
 *  - EXPRESS: si el lead trae dotación estructurada (cotizador público), muestra
 *    un RESUMEN de lo pedido + campos clave editables (instalación, comuna) y
 *    cotiza con el motor real usando ESA dotación (no la inventa).
 *  - Si no trae datos → cae al fallback deep-link "Convertir en OPAI".
 */
export async function buildCotizarView(tenantId: string, leadId: string): Promise<SlackView> {
  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, tenantId },
    select: { firstName: true, lastName: true, companyName: true, commune: true, metadata: true },
  });
  const name = lead ? leadDisplayName(lead) : "Lead";
  const convertUrl = `${getCanonicalSiteUrl()}/crm/leads/${leadId}`;
  const dot = parseDotacion(lead?.metadata);
  if (dot.length === 0) return convertFallbackView(name, convertUrl);

  const totalGuards = dot.reduce((s, d) => s + d.cantidad * d.numPuestos, 0);
  const resumen = dot.map((d) => `• ${d.puesto}: ${d.cantidad}${d.numPuestos > 1 ? ` × ${d.numPuestos} puestos` : ""}`).join("\n");
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
      { type: "section", text: { type: "mrkdwn", text: `Cotización *exprés* para *${name}* (${totalGuards} guardias). El precio sale del mismo motor que la web.` } },
      { type: "section", text: { type: "mrkdwn", text: `*Solicitado:*\n${resumen}` } },
      input("instname", "Instalación", lead?.companyName?.trim() || name),
      input("comuna", "Comuna", lead?.commune ?? undefined, true),
      { type: "context", elements: [{ type: "mrkdwn", text: `¿Necesitas afinar más? <${convertUrl}|Convertir en OPAI (cockpit completo)>` }] },
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
    const instName = (ctx.state.instname?.v?.value ?? "").trim();
    const comuna = (ctx.state.comuna?.v?.value ?? "").trim();
    if (!leadId) return { ack: { response_action: "errors", errors: { instname: "Lead no válido." } } };

    const slackUserId = ctx.slackUserId;
    const botToken = ctx.workspace.botToken;
    const tenantId = ctx.tenantId;
    const userId = ctx.linked.adminId;

    const work = async () => {
      const lead = await prisma.crmLead.findFirst({ where: { id: leadId, tenantId }, select: { firstName: true, lastName: true, companyName: true, city: true, address: true, metadata: true } });
      const leadName = lead ? leadDisplayName(lead) : "lead";
      // Exprés: cotiza con la dotación REAL del lead (no inventa); un puesto genérico si faltara.
      const dot = parseDotacion(lead?.metadata);
      const dotacion = (dot.length ? dot : [{ puesto: "Guardia de Seguridad", cantidad: 1, numPuestos: 1 }]).map((d) => ({ puesto: d.puesto, cantidad: d.cantidad, numPuestos: d.numPuestos, dias: [] as string[] }));
      const body = {
        installations: [{
          name: instName || lead?.companyName || "Instalación",
          commune: comuna || undefined,
          city: lead?.city ?? undefined,
          address: lead?.address ?? undefined,
          dotacion,
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
