/**
 * Dispatch de los block_actions de la bandeja de tickets (Fase 7):
 *  - `tray_f_*`  cambia un filtro → re-lista y views.update la bandeja.
 *  - `tray_page` pagina (prev/next) → views.update.
 *  - `tray_row`  el select de acción por fila → views.push del modal secundario.
 * Aislamiento: tenant por team_id, identidad por vínculo; el ticketId del row
 * se re-valida en el submit (el servicio filtra por tenant).
 */

import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView, slackPushView } from "../api";
import { unpackMetadata } from "../modals/views";
import { listMyTickets, type TrayFilters } from "./list";
import { buildTrayView } from "./tray";
import { commentModalView, statusModalView, priorityModalView, reassignModalView, confirmModalView } from "./row-views";

const ROW_BUILDERS: Record<string, (id: string, code: string) => unknown> = {
  comment: commentModalView,
  status: statusModalView,
  priority: priorityModalView,
  reassign: reassignModalView,
  close: (id, code) => confirmModalView(id, code, "close"),
  cancel: (id, code) => confirmModalView(id, code, "cancel"),
};

function filtersFromMeta(m: ReturnType<typeof unpackMetadata>): { filters: TrayFilters; page: number } {
  return {
    filters: {
      status: m.status || undefined,
      priority: m.priority || undefined,
      slaBreached: m.sla === "1",
      approvals: m.approvals === "1",
    },
    page: parseInt(m.page || "1", 10) || 1,
  };
}

/** ¿Es un block_action de la bandeja? (para enrutarlo desde interactivity) */
export function isTrayAction(actionId: string): boolean {
  return actionId.startsWith("tray_");
}

export async function handleTrayAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const triggerId = payload.trigger_id as string | undefined;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const view = payload.view as { id?: string; private_metadata?: string } | undefined;
  const action = (payload.actions as Array<{ action_id?: string; value?: string; selected_option?: { value?: string } }> | undefined)?.[0];
  if (!teamId || !slackUserId || !action?.action_id) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const meta = unpackMetadata(view?.private_metadata);
  const { filters, page } = filtersFromMeta(meta);
  const actionId = action.action_id;

  // Fila: abrir el modal secundario correspondiente (views.push).
  if (actionId === "tray_row") {
    const [op, ticketId, code] = (action.selected_option?.value ?? "").split(":");
    const builder = ROW_BUILDERS[op];
    if (!builder || !ticketId || !triggerId) return;
    await slackPushView(workspace.botToken, triggerId, builder(ticketId, code ?? ticketId));
    return;
  }

  // Filtros / paginación: recomputar y actualizar la bandeja.
  const next: TrayFilters = { ...filters };
  let nextPage = page;
  if (actionId === "tray_f_status") {
    next.status = valOf(action) || undefined;
    nextPage = 1;
  } else if (actionId === "tray_f_priority") {
    next.priority = valOf(action) || undefined;
    nextPage = 1;
  } else if (actionId === "tray_f_sla") {
    next.slaBreached = valOf(action) === "1";
    nextPage = 1;
  } else if (actionId === "tray_page") {
    nextPage = action.value === "next" ? page + 1 : Math.max(1, page - 1);
  } else {
    return;
  }

  const data = await listMyTickets(workspace.tenantId, linked.adminId, next, nextPage);
  if (view?.id) await slackUpdateView(workspace.botToken, view.id, buildTrayView(data, next));
}

function valOf(action: { selected_option?: { value?: string } }): string {
  const v = action.selected_option?.value ?? "";
  return v === "__all" ? "" : v;
}
