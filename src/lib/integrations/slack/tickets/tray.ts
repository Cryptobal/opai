/**
 * Bandeja "Mis tickets" en Slack (Fase 7): filtros (estado, prioridad, SLA) +
 * lista paginada (10/página). Cada fila: código enlazado a OPAI + badges +
 * un select de acción (comentar / estado / prioridad / reasignar / cerrar /
 * cancelar). El estado (filtros + página) viaja en private_metadata.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from "@/lib/tickets";
import { listMyTickets, TRAY_PAGE_SIZE, type TrayFilters, type TrayRow } from "./list";
import { packMetadata } from "../modals/views";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const opt = (value: string, label: string) => ({ text: pt(label), value });

const STATUS_OPTS = [["", "Activos"], ["resolved", "Resueltos"], ["cancelled", "Cancelados"], ["pending_approval", "Pendiente aprob."]];
const PRIO_OPTS = [["", "Todas"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"], ["p4", "P4"]];
const SLA_OPTS = [["", "SLA: todos"], ["1", "SLA: vencidos"]];

function selectFilter(actionId: string, opts: string[][], current: string) {
  const options = opts.map(([v, l]) => opt(v || "__all", l));
  const init = options.find((o) => o.value === (current || "__all")) ?? options[0];
  return { type: "static_select", action_id: actionId, initial_option: init, options };
}

function rowSection(t: TrayRow): unknown {
  const url = `${getCanonicalSiteUrl()}/ops/tickets/${t.id}`;
  const st = TICKET_STATUS_CONFIG[t.status as keyof typeof TICKET_STATUS_CONFIG]?.label ?? t.status;
  const pr = TICKET_PRIORITY_CONFIG[t.priority as keyof typeof TICKET_PRIORITY_CONFIG]?.shortLabel ?? t.priority;
  const sla = t.slaBreached ? "  ·  🔴 SLA vencido" : "";
  const ref = `${t.id}:${t.code}`; // id (uuid) y code no llevan ':'
  const actions = [
    opt(`comment:${ref}`, "💬 Comentar"),
    opt(`status:${ref}`, "🔄 Cambiar estado"),
    opt(`priority:${ref}`, "⚑ Cambiar prioridad"),
    opt(`reassign:${ref}`, "👤 Reasignar"),
    opt(`aplazar:${ref}`, "⏳ Aplazar SLA"),
    opt(`pausar:${ref}`, "⏸ Pausar/Reanudar SLA"),
    opt(`silenciar:${ref}`, "🔕 Silenciar avisos"),
    opt(`close:${ref}`, "✅ Cerrar (resolver)"),
    opt(`cancel:${ref}`, "🚫 Cancelar"),
  ];
  return {
    type: "section",
    text: { type: "mrkdwn", text: `<${url}|${t.code}> · ${t.title}\n\`${st}\`  ·  \`${pr}\`${sla}` },
    accessory: { type: "static_select", action_id: "tray_row", placeholder: pt("Acción…"), options: actions },
  };
}

export function buildTrayView(
  data: { rows: TrayRow[]; total: number; page: number; hasMore: boolean },
  filters: TrayFilters,
): SlackView {
  const blocks: unknown[] = [
    {
      type: "actions",
      elements: [
        selectFilter("tray_f_status", STATUS_OPTS, filters.status ?? ""),
        selectFilter("tray_f_priority", PRIO_OPTS, filters.priority ?? ""),
        selectFilter("tray_f_sla", SLA_OPTS, filters.slaBreached ? "1" : ""),
      ],
    },
    { type: "divider" },
  ];

  if (data.rows.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No hay tickets con estos filtros. 🎉" } });
  } else {
    for (const t of data.rows) blocks.push(rowSection(t));
  }

  const totalPages = Math.max(1, Math.ceil(data.total / TRAY_PAGE_SIZE));
  const pager: unknown[] = [];
  if (data.page > 1) pager.push({ type: "button", text: pt("‹ Anterior"), value: "prev", action_id: "tray_page" });
  if (data.hasMore) pager.push({ type: "button", text: pt("Siguiente ›"), value: "next", action_id: "tray_page" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Página ${data.page}/${totalPages} · ${data.total} ticket(s)` }] });
  if (pager.length) blocks.push({ type: "actions", elements: pager });

  return {
    type: "modal",
    callback_id: "opai_tickets",
    private_metadata: packMetadata({
      kind: "tickets_tray",
      status: filters.status,
      priority: filters.priority,
      sla: filters.slaBreached ? "1" : "",
      page: String(data.page),
      approvals: filters.approvals ? "1" : "",
    }),
    title: pt(filters.approvals ? "Mis aprobaciones" : "Mis tickets"),
    close: pt("Cerrar"),
    blocks,
  };
}

/** Abre la bandeja (desde /opai tickets o el hub). */
async function build(ctx: ModalOpenContext, filters: TrayFilters = {}): Promise<SlackView> {
  const data = await listMyTickets(ctx.tenantId, ctx.linked.adminId, filters, 1);
  return buildTrayView(data, filters);
}

export const trayModal: ModalDef = {
  callbackId: "opai_tickets",
  title: "Mis tickets",
  build: (ctx) => build(ctx),
  submit: async () => ({ ack: {} }),
};

/** `/opai tickets vencidos` — bandeja pre-filtrada por SLA vencido. */
export const trayOverdueModal: ModalDef = {
  callbackId: "opai_tickets_vencidos",
  title: "Tickets vencidos",
  build: (ctx) => build(ctx, { slaBreached: true }),
  submit: async () => ({ ack: {} }),
};
