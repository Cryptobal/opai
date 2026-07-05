/**
 * Bandeja de cotizaciones en Slack (Fase 15, B4): `/opai cotizaciones [estado]`.
 * Filtro por estado + lista paginada; cada fila con 🟢 WhatsApp al contacto.
 */

import { prisma } from "@/lib/prisma";
import { canView } from "@/lib/permissions";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView } from "../api";
import { packMetadata, unpackMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import { clp, resolveDealWaUrl } from "./deal-common";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });
const opt = (value: string, label: string) => ({ text: pt(label), value });
const PAGE = 10;

const STATUS_OPTS = [["", "Todas"], ["draft", "Borrador"], ["sent", "Enviadas"], ["accepted", "Aceptadas"], ["rejected", "Rechazadas"]];
const STATUS_LABEL: Record<string, string> = { draft: "Borrador", sent: "Enviada", accepted: "Aceptada", rejected: "Rechazada" };

interface QuoteRow {
  id: string; code: string; clientName: string; monto: number; status: string;
  dealId: string | null; contactFirst: string | null; contactPhone: string | null;
}

async function listQuotes(tenantId: string, status: string, page: number): Promise<{ rows: QuoteRow[]; total: number; page: number; hasMore: boolean }> {
  const where: Record<string, unknown> = { tenantId };
  if (status) where.status = status;
  const p = Math.max(1, page);
  const skip = (p - 1) * PAGE;
  const [items, total] = await Promise.all([
    prisma.cpqQuote.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take: PAGE,
      select: { id: true, code: true, clientName: true, status: true, dealId: true, contactId: true, monthlyCost: true, accountId: true, parameters: { select: { salePriceMonthly: true } } },
    }),
    prisma.cpqQuote.count({ where }),
  ]);
  const contactIds = items.map((q) => q.contactId).filter((x): x is string => !!x);
  const accountIds = items.map((q) => q.accountId).filter((x): x is string => !!x);
  const [contacts, accounts] = await Promise.all([
    contactIds.length ? prisma.crmContact.findMany({ where: { id: { in: contactIds }, tenantId }, select: { id: true, firstName: true, phone: true } }) : [],
    accountIds.length ? prisma.crmAccount.findMany({ where: { id: { in: accountIds }, tenantId }, select: { id: true, name: true } }) : [],
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const aById = new Map(accounts.map((a) => [a.id, a.name]));
  const rows: QuoteRow[] = items.map((q) => {
    const c = q.contactId ? cById.get(q.contactId) : null;
    return {
      id: q.id, code: q.code,
      clientName: q.clientName || (q.accountId ? aById.get(q.accountId) ?? "" : "") || "Cliente",
      monto: Number(q.parameters?.salePriceMonthly ?? 0) || Number(q.monthlyCost ?? 0),
      status: q.status, dealId: q.dealId, contactFirst: c?.firstName ?? null, contactPhone: c?.phone ?? null,
    };
  });
  return { rows, total, page: p, hasMore: skip + rows.length < total };
}

function trayView(data: { rows: QuoteRow[]; total: number; page: number; hasMore: boolean }, status: string, waUrls: Map<string, string | null>): SlackView {
  const blocks: unknown[] = [{
    type: "actions",
    elements: [{ type: "static_select", action_id: "quotestray_f_status", initial_option: opt(status || "__all", STATUS_OPTS.find(([v]) => v === status)?.[1] ?? "Todas"), options: STATUS_OPTS.map(([v, l]) => opt(v || "__all", l)) }],
  }, { type: "divider" }];
  if (data.rows.length === 0) blocks.push({ type: "section", text: { type: "mrkdwn", text: "No hay cotizaciones con este filtro." } });
  for (const q of data.rows) {
    const url = `${getCanonicalSiteUrl()}/crm/cotizaciones/${q.id}`;
    const section: Record<string, unknown> = {
      type: "section",
      text: { type: "mrkdwn", text: `<${url}|${q.code}> · ${q.clientName}\n${clp(q.monto)}/mes · \`${STATUS_LABEL[q.status] ?? q.status}\`` },
    };
    const wa = waUrls.get(q.id);
    if (wa) section.accessory = { type: "button", action_id: "quotestray_wa", url: wa, text: pt("🟢 WhatsApp") };
    blocks.push(section);
  }
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE));
  const pager: unknown[] = [];
  if (data.page > 1) pager.push({ type: "button", text: pt("‹ Anterior"), value: "prev", action_id: "quotestray_page" });
  if (data.hasMore) pager.push({ type: "button", text: pt("Siguiente ›"), value: "next", action_id: "quotestray_page" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Página ${data.page}/${totalPages} · ${data.total} cotización(es)` }] });
  if (pager.length) blocks.push({ type: "actions", elements: pager });

  return {
    type: "modal", callback_id: "opai_cotizaciones",
    private_metadata: packMetadata({ kind: "quotes_tray", qstatus: status, page: String(data.page) }),
    title: modalTitle("Cotizaciones"), close: pt("Cerrar"), blocks,
  };
}

async function renderQuotesTray(tenantId: string, status: string, page: number): Promise<SlackView> {
  const data = await listQuotes(tenantId, status, page);
  const pairs = await Promise.all(
    data.rows.map(async (q) => [
      q.id,
      q.dealId ? await resolveDealWaUrl(tenantId, q.dealId).catch(() => null) : null,
    ] as const),
  );
  return trayView(data, status, new Map(pairs));
}

export async function handleQuotesTrayAction(payload: {
  team?: { id?: string }; user?: { id?: string };
  view?: { id?: string; private_metadata?: string };
  actions?: Array<{ action_id?: string; value?: string; selected_option?: { value?: string } }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  if (!teamId || !slackUserId || !action?.action_id || !payload.view?.id) return;
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  const meta = unpackMetadata(payload.view.private_metadata);
  let status = meta.qstatus || "";
  let page = parseInt(meta.page || "1", 10) || 1;
  if (action.action_id === "quotestray_f_status") { const v = action.selected_option?.value ?? ""; status = v === "__all" ? "" : v; page = 1; }
  else if (action.action_id === "quotestray_page") page = action.value === "next" ? page + 1 : Math.max(1, page - 1);
  else return;
  await slackUpdateView(workspace.botToken, payload.view.id, await renderQuotesTray(workspace.tenantId, status, page));
}

async function build(ctx: ModalOpenContext, status = ""): Promise<SlackView> {
  return renderQuotesTray(ctx.tenantId, status, 1);
}

export const quotesTrayModal: ModalDef = {
  callbackId: "opai_cotizaciones", title: "Cotizaciones",
  requires: (perms) => canView(perms, "crm", "quotes") || canView(perms, "cpq"),
  requiresMessage: "Necesitas acceso a Cotizaciones (CRM/CPQ).",
  build: (ctx) => build(ctx),
  submit: async () => ({ ack: {} }),
};

/** Variantes pre-filtradas: `/opai cotizaciones sent|enviadas|...`. */
export function quotesStatusFromArg(arg: string): string {
  const a = arg.trim().toLowerCase();
  if (["sent", "enviadas", "enviada"].includes(a)) return "sent";
  if (["draft", "borrador", "borradores"].includes(a)) return "draft";
  if (["accepted", "aceptadas", "aceptada", "ganadas"].includes(a)) return "accepted";
  if (["rejected", "rechazadas", "rechazada"].includes(a)) return "rejected";
  return "";
}

export const quotesTrayFiltered = (status: string): ModalDef => ({
  callbackId: `opai_cotizaciones_${status}`, title: "Cotizaciones",
  requires: (perms) => canView(perms, "crm", "quotes") || canView(perms, "cpq"),
  build: (ctx) => build(ctx, status),
  submit: async () => ({ ack: {} }),
});
