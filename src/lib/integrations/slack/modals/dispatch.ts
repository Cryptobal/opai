/**
 * Dispatch de modales de Slack (Fase 5).
 *
 * - `openModalForShortcut`: shortcut/message_action → abre un modal de carga YA
 *   (el trigger_id vence en ~3s) y luego resuelve identidad/permiso/contenido y
 *   hace views.update. Aislamiento: tenant SOLO por `team_id`; identidad SOLO por
 *   `resolveLinkedAdmin`. Sin vínculo → modal de vinculación; sin permiso → aviso.
 * - `prepareViewSubmission`: view_submission → re-resuelve tenant+identidad, y
 *   delega en `modal.submit` que valida y devuelve el ACK síncrono + trabajo
 *   pesado (que la ruta agenda en after()).
 */

import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackOpenView, slackUpdateView, slackPushView } from "../api";
import { loadingView, infoView, linkAccountView, unpackMetadata } from "./views";
import { getModal } from "./registry";
import type { ViewState } from "./types";

export interface OpenModalParams {
  teamId: string;
  triggerId: string;
  callbackId: string;
  slackUserId: string;
  channelId?: string;
  messageTs?: string;
  messageText?: string;
}

/** Abre un modal por callbackId (reusado por shortcuts y por `/opai <cmd>`). */
export async function openModalByCallback(p: OpenModalParams): Promise<void> {
  const { teamId, triggerId, callbackId, slackUserId } = p;
  if (!teamId || !triggerId || !callbackId || !slackUserId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;

  const modal = getModal(callbackId);
  const title = modal?.title ?? "OPAI";

  // (1) Abrir modal de carga de inmediato: consume el trigger_id perecedero.
  let viewId = "";
  try {
    ({ id: viewId } = await slackOpenView(workspace.botToken, triggerId, loadingView(title)));
  } catch (err) {
    console.error("[slack] views.open falló:", err);
    return;
  }
  const update = async (view: unknown): Promise<void> => {
    try {
      await slackUpdateView(workspace.botToken, viewId, view);
    } catch (e) {
      console.error("[slack] views.update falló:", e);
    }
  };

  if (!modal) return update(infoView("OPAI", "Esta acción no está disponible."));

  // (2) Identidad SOLO por vínculo.
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return update(linkAccountView(workspace, slackUserId));

  // (3) Permiso: si no la tiene, el modal ni se abre (aviso claro).
  if (modal.requires && !modal.requires(linked.perms)) {
    return update(infoView(title, modal.requiresMessage ?? "No tienes permiso para esta acción."));
  }

  // (4) Construir el formulario real y reemplazar el modal de carga.
  try {
    const view = await modal.build({
      workspace,
      tenantId: workspace.tenantId,
      linked,
      slackUserId,
      channelId: p.channelId,
      messageTs: p.messageTs,
      messageText: p.messageText,
    });
    await update(view);
  } catch (err) {
    console.error("[slack] build modal falló:", err);
    await update(infoView(title, "No se pudo cargar el formulario. Intenta de nuevo."));
  }
}

/** Extrae los campos del payload de shortcut/message_action y abre el modal. */
export async function openModalForShortcut(payload: Record<string, unknown>): Promise<void> {
  const message = payload.message as { ts?: string; text?: string } | undefined;
  await openModalByCallback({
    teamId: (payload.team as { id?: string } | undefined)?.id ?? "",
    triggerId: (payload.trigger_id as string | undefined) ?? "",
    callbackId: (payload.callback_id as string | undefined) ?? "",
    slackUserId: (payload.user as { id?: string } | undefined)?.id ?? "",
    channelId: (payload.channel as { id?: string } | undefined)?.id,
    messageTs: message?.ts,
    messageText: message?.text,
  });
}

/**
 * Botón "Abrir" del hub (`opai_action_open`): apila el modal de la acción sobre
 * el hub con views.push (usa el trigger_id del block_action). Re-valida capability.
 */
export async function pushActionModal(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const triggerId = payload.trigger_id as string | undefined;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const actions = payload.actions as Array<{ value?: string }> | undefined;
  const actionId = actions?.[0]?.value;
  if (!teamId || !triggerId || !slackUserId || !actionId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const modal = getModal(actionId);
  if (!modal) return;
  try {
    const view =
      modal.requires && !modal.requires(linked.perms)
        ? infoView(modal.title, "No tienes permiso para esta acción.")
        : await modal.build({ workspace, tenantId: workspace.tenantId, linked, slackUserId });
    await slackPushView(workspace.botToken, triggerId, view);
  } catch (err) {
    console.error("[slack] pushActionModal falló:", err);
  }
}

export async function prepareViewSubmission(
  payload: Record<string, unknown>,
): Promise<{ ack: Record<string, unknown>; work?: () => Promise<void> }> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const view = payload.view as
    | { callback_id?: string; private_metadata?: string; state?: { values?: ViewState } }
    | undefined;
  const callbackId = view?.callback_id;
  if (!teamId || !slackUserId || !callbackId) return { ack: {} };

  const modal = getModal(callbackId);
  if (!modal) return { ack: {} };

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return { ack: {} };
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return { ack: {} };

  // Identidad + permiso se re-validan al enviar (defensa; el modal ya se gateó al abrir).
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return { ack: {} };
  if (modal.requires && !modal.requires(linked.perms)) return { ack: {} };

  return modal.submit({
    workspace,
    tenantId: workspace.tenantId,
    linked,
    slackUserId,
    metadata: unpackMetadata(view?.private_metadata),
    state: (view?.state?.values ?? {}) as ViewState,
  });
}
