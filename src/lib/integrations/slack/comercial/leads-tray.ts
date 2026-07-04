/**
 * Bandeja "Leads" en Slack (Fase 15, B1): filtros (estado · origen · sin tomar),
 * lista paginada (10/página) y por cada lead la fila-cockpit (Tomar · WhatsApp ·
 * Recordar · Descartar). Los "sin tomar" van primero y se destacan. El estado de
 * la bandeja (filtros + página) viaja firmado en private_metadata.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { canView } from "@/lib/permissions";
import { listLeads, LEAD_PAGE_SIZE, LEAD_SOURCE_LABELS, type LeadTrayFilters, type LeadRow } from "./leads-list";
import { resolveLeadWaUrl, leadDisplayName } from "./lead-actions";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });
const opt = (value: string, label: string) => ({ text: pt(label), value });

const STATUS_OPTS = [["", "Activos"], ["pending", "Pendientes"], ["in_review", "En revisión"], ["approved", "Aprobados"], ["rejected", "Descartados"]];
const UNTAKEN_OPTS = [["", "Todos"], ["1", "Sin tomar"]];

function sourceOpts(): string[][] {
  return [["", "Todos los orígenes"], ...Object.entries(LEAD_SOURCE_LABELS).map(([v, l]) => [v, l] as string[])];
}

function selectFilter(actionId: string, opts: string[][], current: string) {
  const options = opts.map(([v, l]) => opt(v || "__all", l));
  const init = options.find((o) => o.value === (current || "__all")) ?? options[0];
  return { type: "static_select", action_id: actionId, initial_option: init, options };
}

function rowBlocks(l: LeadRow, waUrl: string | null): unknown[] {
  const url = `${getCanonicalSiteUrl()}/crm/leads/${l.id}`;
  const name = leadDisplayName(l);
  const bits: string[] = [];
  if (l.companyName && l.companyName !== name) bits.push(l.companyName);
  if (l.commune) bits.push(l.commune);
  if (l.source) bits.push(LEAD_SOURCE_LABELS[l.source] ?? l.source);
  const taken = l.firstContactAt ? "🟢 tomado" : "🔴 *sin tomar*";
  const phoneLine = l.phone ? `  ·  📞 ${l.phone}` : "";
  const section: Record<string, unknown> = {
    type: "section",
    text: { type: "mrkdwn", text: `<${url}|${name}>${bits.length ? ` · ${bits.join(" · ")}` : ""}\n${taken}${phoneLine}` },
  };
  if (waUrl) section.accessory = { type: "button", action_id: "leadtray_wa", text: pt("🟢 WhatsApp"), url: waUrl };

  const actions: unknown[] = [];
  if (!l.firstContactAt) actions.push({ type: "button", action_id: "leadtray_take", value: l.id, style: "primary", text: pt("👤 Tomar") });
  actions.push({ type: "button", action_id: "leadtray_remind", value: l.id, text: pt("📅 Recordar 2h") });
  actions.push({ type: "button", action_id: "leadtray_discard", value: l.id, style: "danger", text: pt("❌ Descartar") });
  return [section, { type: "actions", block_id: `opai_leadrow_${l.id}`, elements: actions }];
}

export function buildLeadTrayView(
  data: { rows: LeadRow[]; total: number; page: number; hasMore: boolean },
  filters: LeadTrayFilters,
  waUrls: Map<string, string | null>,
  notice?: string,
): SlackView {
  const blocks: unknown[] = [];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });
  blocks.push({
    type: "actions",
    elements: [
      selectFilter("leadtray_f_status", STATUS_OPTS, filters.status ?? ""),
      selectFilter("leadtray_f_source", sourceOpts(), filters.source ?? ""),
      selectFilter("leadtray_f_untaken", UNTAKEN_OPTS, filters.untaken ? "1" : ""),
    ],
  });
  blocks.push({ type: "divider" });

  if (data.rows.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No hay leads con estos filtros. 🎉" } });
  } else {
    for (const l of data.rows) blocks.push(...rowBlocks(l, waUrls.get(l.id) ?? null));
  }

  const totalPages = Math.max(1, Math.ceil(data.total / LEAD_PAGE_SIZE));
  const pager: unknown[] = [];
  if (data.page > 1) pager.push({ type: "button", text: pt("‹ Anterior"), value: "prev", action_id: "leadtray_page" });
  if (data.hasMore) pager.push({ type: "button", text: pt("Siguiente ›"), value: "next", action_id: "leadtray_page" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Página ${data.page}/${totalPages} · ${data.total} lead(s)` }] });
  if (pager.length) blocks.push({ type: "actions", elements: pager });

  return {
    type: "modal",
    callback_id: "opai_leads",
    private_metadata: packMetadata({
      kind: "leads_tray",
      status: filters.status,
      source: filters.source,
      untaken: filters.untaken ? "1" : "",
      page: String(data.page),
    }),
    title: modalTitle(filters.untaken ? "Leads · Sin tomar" : "Leads"),
    close: pt("Cerrar"),
    blocks,
  };
}

/** Lista + resuelve URLs de WhatsApp en paralelo + arma la view. Fuente única. */
export async function renderLeadTray(
  tenantId: string,
  filters: LeadTrayFilters,
  page: number,
  notice?: string,
): Promise<SlackView> {
  const data = await listLeads(tenantId, filters, page);
  const pairs = await Promise.all(
    data.rows.map(async (l) => [l.id, await resolveLeadWaUrl(tenantId, l).catch(() => null)] as const),
  );
  return buildLeadTrayView(data, filters, new Map(pairs), notice);
}

/** ¿El usuario ve leads? Mismo criterio que la web (submódulo crm/leads). */
export function canViewLeads(perms: Parameters<typeof canView>[0]): boolean {
  return canView(perms, "crm", "leads");
}

async function build(ctx: ModalOpenContext, filters: LeadTrayFilters = {}): Promise<SlackView> {
  return renderLeadTray(ctx.tenantId, filters, 1);
}

export const leadsTrayModal: ModalDef = {
  callbackId: "opai_leads",
  title: "Leads",
  requires: (perms) => canViewLeads(perms),
  requiresMessage: "Necesitas acceso a Leads (CRM).",
  build: (ctx) => build(ctx),
  submit: async () => ({ ack: {} }),
};

/** `/opai leads nuevos` — bandeja pre-filtrada a los sin tomar. */
export const leadsTrayNuevosModal: ModalDef = {
  callbackId: "opai_leads_nuevos",
  title: "Leads sin tomar",
  requires: (perms) => canViewLeads(perms),
  requiresMessage: "Necesitas acceso a Leads (CRM).",
  build: (ctx) => build(ctx, { untaken: true }),
  submit: async () => ({ ack: {} }),
};
