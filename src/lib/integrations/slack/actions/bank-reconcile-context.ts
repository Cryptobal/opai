/**
 * Contexto compartido de los handlers de conciliación desde Slack
 * (bank-reconcile.ts + bank-reconcile-modal.ts): resolución de tenant + actor
 * (Admin vinculado) y helpers de respuesta. Mismo patrón que interactivity.ts.
 *
 * Aislamiento: el tenant SIEMPRE se resuelve por `team_id` (frontera multi-tenant);
 * nunca se confía en ids del payload sin revalidar contra el tenant resuelto.
 */

import { getTenantForTeam, getWorkspaceForTenant, type ActiveWorkspace } from "../workspace";
import { resolveLinkedAdmin, buildLinkPrompt } from "../user-link";
import { slackRespondUrl, slackUpdateMessage } from "../api";
import { replaceMovementInMessage } from "../bank-reconcile-message";

export interface BankReconcilePayload {
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string; text?: string; blocks?: unknown[] };
}

export interface BankReconcileActor {
  workspace: ActiveWorkspace;
  tenantId: string;
  adminId: string;
  slackUserId: string;
}

/**
 * Resuelve workspace + Admin vinculado del usuario que presiona. Si el usuario
 * no está vinculado, responde el prompt de vinculación (efímero) y devuelve null.
 */
export async function resolveBankReconcileActor(
  payload: BankReconcilePayload,
): Promise<BankReconcileActor | null> {
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
  return { workspace, tenantId: workspace.tenantId, adminId: linked.adminId, slackUserId };
}

/** Aviso efímero (no rompe el flujo si falla). */
export async function ephemeral(responseUrl: string | undefined, text: string): Promise<void> {
  if (responseUrl) {
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", text }).catch(() => {});
  }
}

/**
 * Reemplaza el bloque del movimiento `txId` en el mensaje original por
 * `replacement` (estado resuelto o pendiente) vía chat.update. Best-effort.
 */
export async function updateMovementCard(
  actor: BankReconcileActor,
  payload: BankReconcilePayload,
  txId: string,
  replacement: unknown[],
): Promise<void> {
  const channel = payload.container?.channel_id;
  const ts = payload.container?.message_ts ?? payload.message?.ts;
  if (!channel || !ts) return;
  const blocks = replaceMovementInMessage(payload.message?.blocks ?? [], txId, replacement);
  await slackUpdateMessage(actor.workspace.botToken, {
    channel,
    ts,
    text: payload.message?.text ?? "Movimientos bancarios",
    blocks,
  }).catch((e) => console.error("[bankreconc] chat.update falló:", e));
}
