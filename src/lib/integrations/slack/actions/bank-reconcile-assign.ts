/**
 * view_submission del modal de asignación manual (Caso B): concilia el
 * movimiento con la cuenta contable elegida vía `setTransactionLinks`
 * (INCOME/EXPENSE), registra el pending de undo (15 min) y refresca el mensaje.
 *
 * SOLO orquesta: la conciliación vive en `setTransactionLinks`; el undo reusa
 * `clearTransactionLinks` a través de `handleBankReconcileUndo`.
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { setTransactionLinks } from "@/modules/finance/banking/bank-tx-link.service";
import { callSlack, slackUpdateMessage } from "../api";
import { resolvedMovementBlocks, replaceMovementInMessage } from "../bank-reconcile-message";
import { resolveBankReconcileActor, type BankReconcilePayload } from "./bank-reconcile-context";

const UNDO_TTL_MS = 15 * 60 * 1000;

interface ViewSubmissionPayload extends BankReconcilePayload {
  view?: {
    private_metadata?: string;
    state?: { values?: Record<string, { v?: { selected_option?: { value?: string } } }> };
  };
}

/** view_submission (callback_id bankreconc_assign_account). */
export async function handleBankReconcileAssignSubmit(
  payload: ViewSubmissionPayload,
): Promise<{ ack: Record<string, unknown>; work?: () => Promise<void> }> {
  const fieldError = (msg: string) => ({ ack: { response_action: "errors", errors: { account: msg.slice(0, 150) } } });

  const actor = await resolveBankReconcileActor(payload);
  if (!actor) return fieldError("Vinculá tu usuario de Slack para conciliar.");

  let meta: { txId?: string; channelId?: string; messageTs?: string } = {};
  try {
    meta = JSON.parse(payload.view?.private_metadata ?? "{}");
  } catch {
    meta = {};
  }
  const txId = meta.txId;
  const accountPlanId = payload.view?.state?.values?.account?.v?.selected_option?.value;
  if (!txId || !accountPlanId) return fieldError("Elegí una cuenta contable.");

  // Revalidar cuenta + movimiento contra el tenant del actor (aislamiento).
  const account = await prisma.financeAccountPlan.findFirst({
    where: { id: accountPlanId, tenantId: actor.tenantId, isActive: true, acceptsEntries: true },
    select: { code: true, name: true },
  });
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId: actor.tenantId },
    select: { amount: true },
  });
  if (!account || !tx) return fieldError("Cuenta o movimiento no válido.");
  const amount = tx.amount.toNumber();

  try {
    await setTransactionLinks(actor.tenantId, txId, actor.adminId, [
      { targetType: amount > 0 ? "INCOME" : "EXPENSE", targetId: null, amount: Math.abs(amount), accountPlanId },
    ]);
  } catch (err) {
    return fieldError(err instanceof Error ? err.message : "No se pudo asignar la cuenta.");
  }

  const pending = await prisma.slackPendingAction.create({
    data: {
      tenantId: actor.tenantId,
      workspaceId: actor.workspace.id,
      kind: "BANK_RECONCILE_UNDO",
      toolName: "bank_reconcile_undo",
      toolArgs: { txId, accountPlanId },
      entityId: txId,
      requestedBySlackUserId: actor.slackUserId,
      channelId: meta.channelId ?? "",
      messageTs: meta.messageTs || null,
      status: "PENDING",
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
    },
    select: { id: true },
  });

  const statusText = `Asignado a ${account.code} · ${account.name}`;
  // ACK vacío → cierra el modal; el chat.update (más lento) va en after() (work).
  const work = async () => {
    await refreshOriginalCard(actor.workspace.botToken, meta.channelId, meta.messageTs, txId, pending.id, statusText);
    await logAudit({
      action: "CREATE",
      entity: "FinanceBankTransaction",
      entityId: txId,
      tenantId: actor.tenantId,
      userId: actor.adminId,
      details: { operation: "slack_assign_account", accountPlanId, via: "slack" },
    });
  };
  return { ack: {}, work };
}

/** Fetch de los bloques del mensaje original + chat.update reemplazando el mov. */
async function refreshOriginalCard(
  token: string,
  channelId: string | undefined,
  messageTs: string | undefined,
  txId: string,
  pendingId: string,
  statusText: string,
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
    console.error("[bankreconc] fetch de mensaje original falló:", e);
  }
  const blocks = replaceMovementInMessage(existing, txId, resolvedMovementBlocks(txId, statusText, pendingId));
  await slackUpdateMessage(token, { channel: channelId, ts: messageTs, text: "Movimientos bancarios", blocks }).catch(
    (e) => console.error("[bankreconc] chat.update (manual) falló:", e),
  );
}
