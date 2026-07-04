/**
 * Dispatch de los block_actions del cockpit de leads (Fase 15, B1):
 *  - `leadtray_*`  bandeja: filtros / paginación / acción por fila.
 *  - `leadcard_*`  tarjeta de canal de un `new_lead`: Tomar / Recordar / Descartar.
 * Aislamiento: tenant por team_id, identidad por vínculo; el servicio scopea por tenant.
 */

import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView, slackPushView, slackOpenView, slackRespondUrl } from "../api";
import { unpackMetadata } from "../modals/views";
import { renderLeadTray } from "./leads-tray";
import { discardLeadModalView } from "./lead-modals";
import { takeLead, remindLead } from "./lead-actions";
import type { LeadTrayFilters } from "./leads-list";

interface Payload {
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  response_url?: string;
  view?: { id?: string; private_metadata?: string };
  actions?: Array<{ action_id?: string; value?: string; selected_option?: { value?: string } }>;
}

function filtersFromMeta(m: ReturnType<typeof unpackMetadata>): { filters: LeadTrayFilters; page: number } {
  return {
    filters: { status: m.status || undefined, source: m.source || undefined, untaken: m.untaken === "1" },
    page: parseInt(m.page || "1", 10) || 1,
  };
}

const valOf = (a: { selected_option?: { value?: string } }): string => {
  const v = a.selected_option?.value ?? "";
  return v === "__all" ? "" : v;
};

export async function handleLeadTrayAction(payload: Payload): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const view = payload.view;
  const action = payload.actions?.[0];
  if (!teamId || !slackUserId || !action?.action_id) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const { filters, page } = filtersFromMeta(unpackMetadata(view?.private_metadata));
  const actionId = action.action_id;
  const tenantId = workspace.tenantId;

  // Descartar: abre el modal de motivo sobre la bandeja (views.push).
  if (actionId === "leadtray_discard") {
    if (!action.value || !payload.trigger_id) return;
    await slackPushView(workspace.botToken, payload.trigger_id, discardLeadModalView(action.value));
    return;
  }

  // Tomar / Recordar: ejecutan y refrescan la bandeja con un aviso.
  if (actionId === "leadtray_take" || actionId === "leadtray_remind") {
    if (!action.value || !view?.id) return;
    let notice = "";
    if (actionId === "leadtray_take") {
      const r = await takeLead(tenantId, linked.adminId, action.value);
      notice = !r.ok ? `⚠️ ${r.error}` : r.won ? `✅ Tomaste *${r.name}*. Escalamiento detenido.` : `⚠️ *${r.name}* ya lo tomó ${r.alreadyByName ?? "otra persona"}.`;
    } else {
      const r = await remindLead(tenantId, linked.adminId, action.value);
      notice = r.ok ? `📅 Te recordaré *${r.name}* en 2 h.` : `⚠️ ${r.error}`;
    }
    await slackUpdateView(workspace.botToken, view.id, await renderLeadTray(tenantId, filters, page, notice));
    return;
  }

  // Filtros / paginación: recomputar y actualizar.
  const next: LeadTrayFilters = { ...filters };
  let nextPage = page;
  if (actionId === "leadtray_f_status") { next.status = valOf(action) || undefined; nextPage = 1; }
  else if (actionId === "leadtray_f_source") { next.source = valOf(action) || undefined; nextPage = 1; }
  else if (actionId === "leadtray_f_untaken") { next.untaken = valOf(action) === "1"; nextPage = 1; }
  else if (actionId === "leadtray_page") { nextPage = action.value === "next" ? page + 1 : Math.max(1, page - 1); }
  else return;

  if (view?.id) await slackUpdateView(workspace.botToken, view.id, await renderLeadTray(tenantId, next, nextPage));
}

export async function handleLeadCardAction(payload: Payload): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const leadId = action?.value;
  const actionId = action?.action_id;
  if (!teamId || !slackUserId || !actionId || !leadId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  const tenantId = workspace.tenantId;
  const responseUrl = payload.response_url;
  const ephemeral = (text: string) => (responseUrl ? slackRespondUrl(responseUrl, { response_type: "ephemeral", text }) : Promise.resolve());

  if (actionId === "leadcard_take") {
    const r = await takeLead(tenantId, linked.adminId, leadId);
    await ephemeral(!r.ok ? `⚠️ ${r.error}` : r.won ? `✅ Tomaste el lead de *${r.name}*. Escalamiento detenido.` : `⚠️ *${r.name}* ya lo tomó ${r.alreadyByName ?? "otra persona"}.`);
    return;
  }
  if (actionId === "leadcard_remind") {
    const r = await remindLead(tenantId, linked.adminId, leadId);
    await ephemeral(r.ok ? `📅 Te recordaré *${r.name}* en 2 h.` : `⚠️ ${r.error}`);
    return;
  }
  if (actionId === "leadcard_discard") {
    if (!payload.trigger_id) return;
    await slackOpenView(workspace.botToken, payload.trigger_id, discardLeadModalView(leadId));
    return;
  }
}
