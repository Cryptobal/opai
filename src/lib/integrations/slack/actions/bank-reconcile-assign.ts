/**
 * view_submission del modal de asignación manual (Caso B): asigna el
 * movimiento a una CATEGORÍA de flujo de caja vía el motor único
 * `assignBankTxToCategory` (regla "el real consume el proyectado"), registra
 * el pending de undo (15 min) y refresca el mensaje.
 *
 * SOLO orquesta: la lógica de consumo/creación vive en el motor; el undo reusa
 * `revertBankTxCategoryAssignment` a través de `handleBankReconcileUndo`.
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  assignBankTxToCategory,
  AssignToCategoryError,
} from "@/modules/finance/cashflow/assign-to-category.service";
import { signedCLP } from "@/lib/finance/bank-movements-summary";
import { callSlack, slackUpdateMessage } from "../api";
import { resolvedMovementBlocks, replaceMovementInMessage } from "../bank-reconcile-message";
import { resolveBankReconcileActor, type BankReconcilePayload } from "./bank-reconcile-context";

const UNDO_TTL_MS = 15 * 60 * 1000;
const clp = (n: number) => signedCLP(Math.abs(n)).replace(/^[+-]/, "");

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
  const fieldError = (msg: string) => ({ ack: { response_action: "errors", errors: { category: msg.slice(0, 150) } } });

  const actor = await resolveBankReconcileActor(payload);
  if (!actor) return fieldError("Vinculá tu usuario de Slack para asignar.");

  let meta: { txId?: string; channelId?: string; messageTs?: string } = {};
  try {
    meta = JSON.parse(payload.view?.private_metadata ?? "{}");
  } catch {
    meta = {};
  }
  const txId = meta.txId;
  const categoryId = payload.view?.state?.values?.category?.v?.selected_option?.value;
  if (!txId || !categoryId) return fieldError("Elegí una categoría.");

  // Revalidar categoría + movimiento contra el tenant del actor (aislamiento).
  const category = await prisma.financeCashflowCategory.findFirst({
    where: { id: categoryId, tenantId: actor.tenantId, isActive: true },
    select: { name: true },
  });
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId: actor.tenantId, hiddenAt: null },
    select: { description: true },
  });
  if (!category || !tx) return fieldError("Categoría o movimiento no válido.");

  let result: Awaited<ReturnType<typeof assignBankTxToCategory>>;
  try {
    result = await assignBankTxToCategory(actor.tenantId, actor.adminId, {
      bankTransactionId: txId,
      categoryId,
      name: tx.description ?? undefined,
    });
  } catch (err) {
    if (err instanceof AssignToCategoryError) return fieldError(err.message);
    return fieldError(err instanceof Error ? err.message : "No se pudo asignar.");
  }

  const desc = (tx.description ?? "").trim().slice(0, 60);
  const statusText =
    result.mode === "consumed"
      ? `✓ ${desc} → ${category.name} · consumió proyectado (real ${clp(result.realClp)}, proyectado ${clp(result.projectedClp ?? 0)})`
      : `✓ ${desc} → ${category.name} · agregado al flujo`;

  const pending = await prisma.slackPendingAction.create({
    data: {
      tenantId: actor.tenantId,
      workspaceId: actor.workspace.id,
      kind: "BANK_RECONCILE_UNDO",
      toolName: "bank_reconcile_undo",
      // `mode: cashflow_category` → el undo revierte la asignación de categoría
      // (revertBankTxCategoryAssignment), no un link contable legacy.
      toolArgs: { txId, categoryId, mode: "cashflow_category" },
      entityId: txId,
      requestedBySlackUserId: actor.slackUserId,
      channelId: meta.channelId ?? "",
      messageTs: meta.messageTs || null,
      status: "PENDING",
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
    },
    select: { id: true },
  });

  // ACK vacío → cierra el modal; el chat.update (más lento) va en after() (work).
  const work = async () => {
    await refreshOriginalCard(actor.workspace.botToken, meta.channelId, meta.messageTs, txId, pending.id, statusText);
    await logAudit({
      action: "CREATE",
      entity: "FinanceBankTransaction",
      entityId: txId,
      tenantId: actor.tenantId,
      userId: actor.adminId,
      details: { operation: "slack_assign_cashflow_category", categoryId, mode: result.mode, via: "slack" },
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
    (e) => console.error("[bankreconc] chat.update (asignar) falló:", e),
  );
}
