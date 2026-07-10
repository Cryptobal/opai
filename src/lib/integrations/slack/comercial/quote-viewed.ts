/**
 * 🔥 El momento caliente (Fase 15, B3): cuando un cliente ABRE su cotización en
 * el portal, se emite `quote_viewed` (evento antes sin emisor) enriquecido con
 * contacto/teléfono/deal/monto/vigencia. La tarjeta se vuelve accionable:
 * WhatsApp ("¿te llamo?") · 📞 Llamar (línea tel) · ⏰ Recordar en 1h.
 *
 * El emisor vive acá (lo llama el beacon del portal); la tarjeta especial y sus
 * botones se arman en dispatch.ts (rama por-key), y el recordatorio se resuelve
 * en el handler `quoteviewed_remind`.
 */

import { prisma } from "@/lib/prisma";
import { normalizeWaPhone } from "./lead-actions";
import { resolveSlackWaUrl } from "./wa-context";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackRespondUrl } from "../api";

/** No re-alertar por refrescos: una vista más en los últimos 30 min silencia. */
const VIEW_THROTTLE_MS = 30 * 60 * 1000;
const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n));

/** Nombre legible de la cotización: name → título del negocio → código. */
export function resolveQuoteDisplayName(input: {
  name?: string | null;
  dealTitle?: string | null;
  code: string;
}): string {
  const trimmedName = input.name?.trim();
  if (trimmedName) return trimmedName;
  const trimmedDealTitle = input.dealTitle?.trim();
  if (trimmedDealTitle) return trimmedDealTitle;
  return input.code;
}

/** Etiqueta del cliente: clientName de la cotización → cuenta CRM. */
export function resolveQuoteClientName(input: {
  clientName?: string | null;
  accountName?: string | null;
}): string {
  const trimmedClient = input.clientName?.trim();
  if (trimmedClient) return trimmedClient;
  return input.accountName?.trim() ?? "";
}

/** Fragmento del título Slack: nombre + código entre paréntesis si difieren. */
export function formatQuoteViewedLabel(displayName: string, code: string): string {
  if (displayName === code) return code;
  return `${displayName} (${code})`;
}

/** Emite quote_viewed enriquecido (con throttle). Lo llama el beacon del portal. */
export async function emitQuoteViewed(tenantId: string, quoteId: string): Promise<void> {
  // Throttle: si hubo OTRA vista de esta cotización en los ultimos 30 min, callar.
  const recent = await prisma.portalAccessLog.findFirst({
    where: { tenantId, action: "view_quote", resource: quoteId, createdAt: { gte: new Date(Date.now() - VIEW_THROTTLE_MS) } },
    orderBy: { createdAt: "desc" }, skip: 1, select: { id: true },
  });
  if (recent) return;
  const viewCount = await prisma.portalAccessLog.count({ where: { tenantId, action: "view_quote", resource: quoteId } });

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: {
      code: true,
      name: true,
      clientName: true,
      dealId: true,
      contactId: true,
      accountId: true,
      validUntil: true,
      monthlyCost: true,
      parameters: { select: { salePriceMonthly: true } },
    },
  });
  if (!quote) return;
  const [contact, account, deal] = await Promise.all([
    quote.contactId ? prisma.crmContact.findFirst({ where: { id: quote.contactId, tenantId }, select: { firstName: true, lastName: true, phone: true } }) : null,
    quote.accountId ? prisma.crmAccount.findFirst({ where: { id: quote.accountId, tenantId }, select: { name: true } }) : null,
    quote.dealId ? prisma.crmDeal.findFirst({ where: { id: quote.dealId, tenantId }, select: { title: true } }) : null,
  ]);
  const contactName = `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim() || "El cliente";
  const quoteDisplayName = resolveQuoteDisplayName({ name: quote.name, dealTitle: deal?.title, code: quote.code });
  const clientName = resolveQuoteClientName({ clientName: quote.clientName, accountName: account?.name });
  const quoteLabel = formatQuoteViewedLabel(quoteDisplayName, quote.code);
  const monto = Number(quote.parameters?.salePriceMonthly ?? 0) || Number(quote.monthlyCost ?? 0);
  const montoTxt = monto ? clp(monto) : null;
  const vigencia = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CL") : null;

  const { notify } = await import("@/lib/notifications/notify");
  await notify({
    tenantId,
    type: "quote_viewed",
    title: `🔥 ${contactName}${clientName ? ` de ${clientName}` : ""} está viendo ${quoteLabel} AHORA (vista #${viewCount})`,
    body: [montoTxt ? `💰 ${montoTxt}/mes` : null, vigencia ? `Vigencia: ${vigencia}` : null].filter(Boolean).join("  ·  ") || undefined,
    link: quote.dealId ? `/crm/deals/${quote.dealId}` : `/crm/cotizaciones/${quoteId}`,
    // Claves consumidas por la rama quote_viewed de dispatch (campos curados + WhatsApp).
    data: {
      quoteId,
      dealId: quote.dealId ?? undefined,
      phone: contact?.phone ?? undefined,
      contacto: contactName,
      empresa: clientName,
      cotizacion: quoteDisplayName,
      cliente: clientName,
      code: quote.code,
      montoTxt,
      vigencia,
      vista: viewCount,
    },
  });
}

/** Campos curados de la tarjeta 🔥 (evita el ruido del renderer genérico). */
export function quoteViewedFields(data?: Record<string, unknown> | null): Array<{ label: string; value: string }> {
  if (!data) return [];
  const out: Array<{ label: string; value: string }> = [];
  const cotizacion = typeof data.cotizacion === "string" ? data.cotizacion.trim() : "";
  const code = typeof data.code === "string" ? data.code.trim() : "";
  if (cotizacion) {
    out.push({
      label: "Cotización",
      value: cotizacion === code || !code ? cotizacion : `${cotizacion} (${code})`,
    });
  } else if (code) {
    out.push({ label: "Cotización", value: code });
  }
  const cliente = typeof data.cliente === "string" ? data.cliente.trim() : "";
  if (cliente) out.push({ label: "Cliente", value: cliente });
  if (typeof data.montoTxt === "string" && data.montoTxt) out.push({ label: "Monto", value: `${data.montoTxt}/mes` });
  if (typeof data.vigencia === "string" && data.vigencia) out.push({ label: "Vigencia", value: data.vigencia });
  if (typeof data.vista === "number") out.push({ label: "Vista", value: `#${data.vista}` });
  return out;
}

/** Resuelve la URL de WhatsApp "¿te llamo?" para la tarjeta 🔥 (o null sin teléfono). */
export async function resolveQuoteViewedWaUrl(tenantId: string, data?: Record<string, unknown> | null): Promise<string | null> {
  const phone = normalizeWaPhone(typeof data?.phone === "string" ? data.phone : null);
  if (!phone) return null;
  const contacto = typeof data?.contacto === "string" ? data.contacto.trim() : "";
  const contactFirstName = contacto.split(/\s+/)[0] ?? contacto;
  const quoteId = typeof data?.quoteId === "string" ? data.quoteId : null;
  return resolveSlackWaUrl(
    tenantId,
    "hub_hot",
    phone,
    {
      contact: { firstName: contactFirstName },
      account: { name: typeof data?.empresa === "string" ? data.empresa : "" },
    },
    { quoteId },
  );
}

/** Fila de acciones de la tarjeta 🔥: WhatsApp (URL) + ⏰ Recordar 1h. */
export function quoteViewedActionsBlock(quoteId: string, waUrl: string | null): unknown {
  const elements: unknown[] = [];
  if (waUrl) elements.push({ type: "button", action_id: "quoteviewed_wa", url: waUrl, style: "primary", text: { type: "plain_text", text: "🟢 WhatsApp", emoji: true } });
  elements.push({ type: "button", action_id: "quoteviewed_remind", value: quoteId, text: { type: "plain_text", text: "⏰ Recordar 1h", emoji: true } });
  return { type: "actions", block_id: `opai_quoteviewed_${quoteId}`, elements };
}

/** ⏰ Recordar 1h: crea un CrmTask sobre el deal para volver a llamar. */
export async function handleQuoteViewedAction(payload: {
  team?: { id?: string };
  user?: { id?: string };
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  if (!teamId || !slackUserId || action?.action_id !== "quoteviewed_remind" || !action.value) return;
  const quoteId = action.value;
  const responseUrl = payload.response_url;
  const ephemeral = (text: string) => (responseUrl ? slackRespondUrl(responseUrl, { response_type: "ephemeral", text }) : Promise.resolve());

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  const tenantId = workspace.tenantId;

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: { code: true, name: true, dealId: true },
  });
  if (!quote) { await ephemeral("La cotización ya no existe."); return; }
  const deal = quote.dealId
    ? await prisma.crmDeal.findFirst({ where: { id: quote.dealId, tenantId }, select: { title: true } })
    : null;
  const quoteLabel = formatQuoteViewedLabel(
    resolveQuoteDisplayName({ name: quote.name, dealTitle: deal?.title, code: quote.code }),
    quote.code,
  );
  await prisma.crmTask.create({
    data: {
      tenantId, dealId: quote.dealId ?? null, assignedTo: linked.adminId,
      title: `Volver a llamar — está revisando ${quoteLabel}`, type: "followup", status: "open",
      dueAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await ephemeral(`⏰ Te recordaré en 1 h volver a contactar por *${quoteLabel}*.`);
}
