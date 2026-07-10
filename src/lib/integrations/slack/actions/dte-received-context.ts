/**
 * Contexto compartido de los handlers de DTE recibido desde Slack (acuse SII +
 * centro de costo): resolución de tenant + actor (Admin vinculado, con sus
 * permisos para gatear las mutaciones) y helpers de respuesta.
 *
 * Aislamiento: el tenant SIEMPRE se resuelve por `team_id` (frontera
 * multi-tenant); nunca se confía en ids del payload sin revalidar. Réplica de
 * bank-reconcile-context.ts, pero conserva `perms` (acuse/centro de costo son
 * mutaciones gateadas por capability, igual que en la web).
 */

import { getTenantForTeam, getWorkspaceForTenant, type ActiveWorkspace } from "../workspace";
import { resolveLinkedAdmin, buildLinkPrompt } from "../user-link";
import { slackRespondUrl, slackUpdateMessage } from "../api";
import { replaceDteInMessage } from "../dte-received-message";
import type { RolePermissions } from "@/lib/permissions";

export interface DteReceivedPayload {
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string; text?: string; blocks?: unknown[] };
}

export interface DteReceivedActor {
  workspace: ActiveWorkspace;
  tenantId: string;
  adminId: string;
  slackUserId: string;
  perms: RolePermissions;
}

/**
 * Resuelve workspace + Admin vinculado (con permisos) del usuario que presiona.
 * Si no está vinculado, responde el prompt de vinculación efímero y devuelve null.
 */
export async function resolveDteReceivedActor(
  payload: DteReceivedPayload,
): Promise<DteReceivedActor | null> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  if (!teamId || !slackUserId) return null;

  const tenant = await getTenantForTeam(teamId);
  if (!tenant) return null;
  const workspace = await getWorkspaceForTenant(tenant.tenantId);
  if (!workspace) return null;

  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) {
    if (payload.response_url) {
      const prompt = buildLinkPrompt(workspace, slackUserId);
      await slackRespondUrl(payload.response_url, {
        response_type: "ephemeral",
        text: prompt.text,
        blocks: prompt.blocks,
      }).catch(() => {});
    }
    return null;
  }
  return {
    workspace,
    tenantId: workspace.tenantId,
    adminId: linked.adminId,
    slackUserId,
    perms: linked.perms,
  };
}

/** Aviso efímero (no rompe el flujo si falla). */
export async function ephemeral(responseUrl: string | undefined, text: string): Promise<void> {
  if (responseUrl) {
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", text }).catch(() => {});
  }
}

/**
 * Reemplaza el grupo de bloques del `dteId` en el mensaje original por
 * `replacement` vía chat.update, usando los bloques que trae el block_action.
 * Best-effort. (El flujo de modal usa su propio fetch por conversations.history.)
 */
export async function updateDteCard(
  actor: DteReceivedActor,
  payload: DteReceivedPayload,
  dteId: string,
  replacement: unknown[],
): Promise<void> {
  const channel = payload.container?.channel_id;
  const ts = payload.container?.message_ts ?? payload.message?.ts;
  if (!channel || !ts) return;
  const blocks = replaceDteInMessage(payload.message?.blocks ?? [], dteId, replacement);
  await slackUpdateMessage(actor.workspace.botToken, {
    channel,
    ts,
    text: payload.message?.text ?? "DTE recibido",
    blocks,
  }).catch((e) => console.error("[dterecv] chat.update falló:", e));
}
