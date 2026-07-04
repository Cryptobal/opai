/**
 * Bandeja "Mis tickets" en Slack (Fase 7 · alcances Fase 11): fila de chips de
 * alcance (Míos · Mi equipo · Sin asignar · Todos) espejo de la web, + filtros
 * (estado, prioridad, SLA) + lista paginada (10/página). Cada fila: código
 * enlazado a OPAI + badges + un select de acción; y un botón "Tomar" cuando el
 * ticket está sin responsable y pertenece a un equipo del usuario. El estado
 * (alcance + filtros + página) viaja en private_metadata.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from "@/lib/tickets";
import { hasModuleAccess, type RolePermissions } from "@/lib/permissions";
import { listMyTickets, TRAY_PAGE_SIZE, type TrayFilters, type TrayRow, type TrayScope } from "./list";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const opt = (value: string, label: string) => ({ text: pt(label), value });

const STATUS_OPTS = [["", "Activos"], ["resolved", "Resueltos"], ["cancelled", "Cancelados"], ["pending_approval", "Pendiente aprob."]];
const PRIO_OPTS = [["", "Todas"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"], ["p4", "P4"]];
const SLA_OPTS = [["", "SLA: todos"], ["1", "SLA: vencidos"]];

const SCOPE_LABELS: Record<TrayScope, string> = {
  mine: "Míos",
  my_team: "Mi equipo",
  unassigned: "Sin asignar",
  all: "Todos",
};
const SCOPE_TITLES: Record<TrayScope, string> = {
  mine: "Mis tickets",
  my_team: "Tickets · Mi equipo",
  unassigned: "Tickets · Sin asignar",
  all: "Tickets · Todos",
};

function selectFilter(actionId: string, opts: string[][], current: string) {
  const options = opts.map(([v, l]) => opt(v || "__all", l));
  const init = options.find((o) => o.value === (current || "__all")) ?? options[0];
  return { type: "static_select", action_id: actionId, initial_option: init, options };
}

/** Chips de alcance (botones); los tenant-wide solo si el usuario ve global. */
function scopeChips(active: TrayScope, canViewAll: boolean): unknown {
  const scopes: TrayScope[] = canViewAll
    ? ["mine", "my_team", "unassigned", "all"]
    : ["mine", "my_team"];
  return {
    type: "actions",
    elements: scopes.map((s) => {
      const btn: Record<string, unknown> = {
        type: "button",
        text: pt(SCOPE_LABELS[s]),
        action_id: `tray_scope_${s}`,
        value: s,
      };
      if (s === active) btn.style = "primary";
      return btn;
    }),
  };
}

function rowSection(t: TrayRow): unknown {
  const url = `${getCanonicalSiteUrl()}/ops/tickets/${t.id}`;
  const st = TICKET_STATUS_CONFIG[t.status as keyof typeof TICKET_STATUS_CONFIG]?.label ?? t.status;
  const pr = TICKET_PRIORITY_CONFIG[t.priority as keyof typeof TICKET_PRIORITY_CONFIG]?.shortLabel ?? t.priority;
  const sla = t.slaBreached ? "  ·  🔴 SLA vencido" : "";
  const unassigned = t.assignedTo ? "" : "  ·  ⚪ Sin asignar";
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
    text: { type: "mrkdwn", text: `<${url}|${t.code}> · ${t.title}\n\`${st}\`  ·  \`${pr}\`${sla}${unassigned}` },
    accessory: { type: "static_select", action_id: "tray_row", placeholder: pt("Acción…"), options: actions },
  };
}

/** Ticket "tomable": sin responsable y de un equipo del usuario. */
function canTake(t: TrayRow, teams: string[]): boolean {
  return !t.assignedTo && !!t.assignedTeam && teams.includes(t.assignedTeam);
}

/** Botón "Tomar" (asignarme) para una fila tomable. */
function takeButton(t: TrayRow): unknown {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: pt("🙋 Tomar"),
        style: "primary",
        action_id: "tray_take",
        value: `${t.id}:${t.code}`,
      },
    ],
  };
}

export function buildTrayView(
  data: { rows: TrayRow[]; total: number; page: number; hasMore: boolean; teams: string[] },
  filters: TrayFilters,
  opts?: { canViewAll?: boolean; notice?: string },
): SlackView {
  const scope: TrayScope = filters.scope ?? "my_team";
  const canViewAll = !!opts?.canViewAll;
  const blocks: unknown[] = [];

  if (opts?.notice) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: opts.notice }] });
  }

  // Chips de alcance (solo si no es la sub-bandeja de aprobaciones).
  if (!filters.approvals) blocks.push(scopeChips(scope, canViewAll));

  blocks.push({
    type: "actions",
    elements: [
      selectFilter("tray_f_status", STATUS_OPTS, filters.status ?? ""),
      selectFilter("tray_f_priority", PRIO_OPTS, filters.priority ?? ""),
      selectFilter("tray_f_sla", SLA_OPTS, filters.slaBreached ? "1" : ""),
    ],
  });
  blocks.push({ type: "divider" });

  if (data.rows.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No hay tickets con estos filtros. 🎉" } });
  } else {
    for (const t of data.rows) {
      blocks.push(rowSection(t));
      if (canTake(t, data.teams)) blocks.push(takeButton(t));
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / TRAY_PAGE_SIZE));
  const pager: unknown[] = [];
  if (data.page > 1) pager.push({ type: "button", text: pt("‹ Anterior"), value: "prev", action_id: "tray_page" });
  if (data.hasMore) pager.push({ type: "button", text: pt("Siguiente ›"), value: "next", action_id: "tray_page" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Página ${data.page}/${totalPages} · ${data.total} ticket(s)` }] });
  if (pager.length) blocks.push({ type: "actions", elements: pager });

  const title = filters.approvals ? "Mis aprobaciones" : SCOPE_TITLES[scope];
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
      scope,
    }),
    title: modalTitle(title),
    close: pt("Cerrar"),
    blocks,
  };
}

/** ¿El usuario ve tickets a nivel tenant? Mismo criterio que la web (módulo ops). */
export function canViewAllTickets(perms: RolePermissions): boolean {
  return hasModuleAccess(perms, "ops");
}

/** Abre la bandeja (desde /opai tickets o el hub). */
async function build(ctx: ModalOpenContext, filters: TrayFilters = {}): Promise<SlackView> {
  const canViewAll = canViewAllTickets(ctx.linked.perms);
  // Defensa: un alcance tenant-wide sin visión global degrada a "mi equipo".
  const scope = filters.scope ?? "my_team";
  const safeScope: TrayScope = !canViewAll && (scope === "all" || scope === "unassigned") ? "my_team" : scope;
  const f: TrayFilters = { ...filters, scope: safeScope };
  const data = await listMyTickets(ctx.tenantId, ctx.linked.adminId, f, 1);
  return buildTrayView(data, f, { canViewAll });
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
