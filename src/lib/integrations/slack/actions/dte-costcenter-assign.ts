/**
 * view_submission del modal de centro de costo (callback_id
 * `dterecv_costcenter_assign`): persiste cliente+instalación vía el service
 * compartido `assignDteCostCenter` (misma validación que el endpoint web) y
 * refresca la card del DTE. Réplica de bank-reconcile-assign.ts.
 */

import { logAudit } from "@/lib/audit";
import { hasCapability } from "@/lib/permissions";
import {
  assignDteCostCenter,
  AssignDteCostCenterError,
} from "@/modules/finance/billing/dte-cost-center.service";
import { callSlack, slackUpdateMessage } from "../api";
import { renderDteBlocks } from "../dte-received-blocks";
import { loadDteForBlocks } from "../dte-received-load";
import { replaceDteInMessage } from "../dte-received-message";
import { resolveDteReceivedActor, type DteReceivedPayload } from "./dte-received-context";

interface ViewSubmissionPayload extends DteReceivedPayload {
  view?: {
    private_metadata?: string;
    state?: { values?: Record<string, { v?: { selected_option?: { value?: string } } }> };
  };
}

export async function handleDteCostCenterAssignSubmit(
  payload: ViewSubmissionPayload,
): Promise<{ ack: Record<string, unknown>; work?: () => Promise<void> }> {
  const fieldError = (msg: string) => ({
    ack: { response_action: "errors", errors: { costcenter: msg.slice(0, 150) } },
  });

  const actor = await resolveDteReceivedActor(payload);
  if (!actor) return fieldError("Vinculá tu usuario de Slack para asignar.");
  if (!hasCapability(actor.perms, "facturacion_manage")) {
    return fieldError("No tenés permiso para asignar centro de costo.");
  }

  let meta: { dteId?: string; channelId?: string; messageTs?: string } = {};
  try {
    meta = JSON.parse(payload.view?.private_metadata ?? "{}");
  } catch {
    meta = {};
  }
  const dteId = meta.dteId;
  const selected = payload.view?.state?.values?.costcenter?.v?.selected_option?.value;
  if (!dteId || !selected) return fieldError("Elegí una instalación.");
  const [crmAccountId, installationId] = selected.split("|");
  if (!crmAccountId || !installationId) return fieldError("Selección inválida.");

  try {
    await assignDteCostCenter(actor.tenantId, dteId, { crmAccountId, installationId });
  } catch (err) {
    if (err instanceof AssignDteCostCenterError) return fieldError(err.message);
    return fieldError(err instanceof Error ? err.message : "No se pudo asignar.");
  }

  // ACK vacío → cierra el modal; el chat.update (más lento) va en after() (work).
  const work = async () => {
    await refreshCard(actor.workspace.botToken, meta.channelId, meta.messageTs, actor.tenantId, dteId);
    // Confirmación efímera best-effort (el view_submission no trae response_url).
    if (meta.channelId && actor.slackUserId) {
      await callSlack(
        "chat.postEphemeral",
        { channel: meta.channelId, user: actor.slackUserId, text: "✅ Centro de costo asignado" },
        actor.workspace.botToken,
      ).catch(() => {});
    }
    await logAudit({
      action: "UPDATE",
      entity: "FinanceDte",
      entityId: dteId,
      tenantId: actor.tenantId,
      userId: actor.adminId,
      details: { operation: "slack_dte_cost_center", crmAccountId, installationId, via: "slack" },
    });
  };
  return { ack: {}, work };
}

/** Re-fetch de los bloques del mensaje original + chat.update del bloque del DTE. */
async function refreshCard(
  token: string,
  channelId: string | undefined,
  messageTs: string | undefined,
  tenantId: string,
  dteId: string,
): Promise<void> {
  if (!channelId || !messageTs) return;
  let existing: unknown[] = [];
  try {
    const json = await callSlack(
      "conversations.history",
      { channel: channelId, latest: messageTs, oldest: messageTs, inclusive: true, limit: 1 },
      token,
    );
    const msg = ((json.messages as Array<Record<string, unknown>>) ?? [])[0];
    if (Array.isArray(msg?.blocks)) existing = msg.blocks as unknown[];
  } catch (e) {
    console.error("[dterecv] fetch de mensaje original falló:", e);
  }
  const row = await loadDteForBlocks(tenantId, dteId);
  if (!row) return;
  const blocks = replaceDteInMessage(existing, dteId, renderDteBlocks(row));
  await slackUpdateMessage(token, { channel: channelId, ts: messageTs, text: "DTE recibido", blocks }).catch(
    (e) => console.error("[dterecv] chat.update (centro de costo) falló:", e),
  );
}
