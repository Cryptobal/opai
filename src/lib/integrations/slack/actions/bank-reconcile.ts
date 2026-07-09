/**
 * Conciliación de un movimiento bancario DESDE el mensaje de Slack.
 *
 * SOLO orquesta: resuelve contexto/actor → llama a los servicios existentes
 * (`bulkReconcileToDte` para conciliar, `clearTransactionLinks` para deshacer)
 * → actualiza el mensaje. Cero lógica de conciliación nueva.
 *
 *  - `bankreconc_confirm` (Caso A): concilia el mov contra el DTE que coincide
 *     en monto exacto y deja un botón "Deshacer" con ventana de 15 min.
 *  - `bankreconc_undo`: revierte esa conciliación (transición atómica del
 *     SlackPendingAction → idempotente ante doble-click / redelivery de Slack).
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  bulkReconcileToDte,
  clearTransactionLinks,
} from "@/modules/finance/banking/bank-tx-link.service";
import { buildSingleMovement } from "@/modules/finance/banking/slack-movements-payload";
import { renderMovementBlocks } from "../bank-reconcile-blocks";
import { resolvedMovementBlocks } from "../bank-reconcile-message";
import {
  resolveBankReconcileActor,
  ephemeral,
  updateMovementCard,
  type BankReconcilePayload,
  type BankReconcileActor,
} from "./bank-reconcile-context";

const UNDO_TTL_MS = 15 * 60 * 1000;

/** Caso A: conciliar el movimiento contra el DTE con match exacto de monto. */
export async function handleBankReconcileConfirm(payload: BankReconcilePayload): Promise<void> {
  const actor = await resolveBankReconcileActor(payload);
  if (!actor) return;

  let parsed: { txId?: string; dteId?: string } = {};
  try {
    parsed = JSON.parse(payload.actions?.[0]?.value ?? "{}");
  } catch {
    parsed = {};
  }
  const { txId, dteId } = parsed;
  if (!txId || !dteId) {
    await ephemeral(payload.response_url, "Acción inválida.");
    return;
  }

  // Revalidar ambos ids contra el tenant del actor (nunca confiar en el value).
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId: actor.tenantId },
    select: { folio: true, direction: true, receiverName: true, issuerName: true },
  });
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId: actor.tenantId },
    select: { id: true },
  });
  if (!dte || !tx) {
    await ephemeral(payload.response_url, "Movimiento o factura no encontrados.");
    return;
  }

  let paymentRecordId: string;
  try {
    const result = await bulkReconcileToDte(actor.tenantId, actor.adminId, {
      bankTransactionIds: [txId],
      dteId,
    });
    paymentRecordId = result.paymentRecordId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo conciliar";
    await ephemeral(payload.response_url, `⚠️ ${msg}`);
    // Colisión: si ya lo conciliaron desde la web entre publicar y el tap,
    // refrescamos el bloque a estado resuelto (sin botones) para no confundir.
    if (/conciliad/i.test(msg)) {
      await updateMovementCard(actor, payload, txId, resolvedMovementBlocks(txId, "Movimiento ya conciliado (desde la web)", null));
    }
    return;
  }

  const kind = dte.direction === "RECEIVED" ? "compra" : "venta";
  const counterparty =
    dte.direction === "RECEIVED" ? dte.issuerName || "proveedor" : dte.receiverName || "cliente";
  const statusText = `Conciliado con ${kind} *F-${dte.folio}* · ${counterparty}`;

  const pending = await prisma.slackPendingAction.create({
    data: {
      tenantId: actor.tenantId,
      workspaceId: actor.workspace.id,
      kind: "BANK_RECONCILE_UNDO",
      toolName: "bank_reconcile_undo",
      toolArgs: { txId, dteId, paymentRecordId },
      entityId: txId,
      requestedBySlackUserId: actor.slackUserId,
      channelId: payload.container?.channel_id ?? "",
      messageTs: payload.container?.message_ts ?? payload.message?.ts ?? null,
      status: "PENDING",
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
    },
    select: { id: true },
  });

  await updateMovementCard(actor, payload, txId, resolvedMovementBlocks(txId, statusText, pending.id));
  await logAudit({
    action: "CREATE",
    entity: "FinanceBankTransaction",
    entityId: txId,
    tenantId: actor.tenantId,
    userId: actor.adminId,
    details: { operation: "slack_reconcile", dteId, via: "slack" },
  });
}

/** Deshacer la conciliación (Caso A) dentro de la ventana de 15 min. */
export async function handleBankReconcileUndo(payload: BankReconcilePayload): Promise<void> {
  const actor = await resolveBankReconcileActor(payload);
  if (!actor) return;
  const pendingId = payload.actions?.[0]?.value;
  if (!pendingId) return;

  const pending = await prisma.slackPendingAction.findFirst({
    where: { id: pendingId, tenantId: actor.tenantId },
    select: { toolArgs: true },
  });
  if (!pending) {
    await ephemeral(payload.response_url, "Esta acción ya no existe.");
    return;
  }

  // Transición atómica PENDING→CANCELLED: un doble-click / redelivery no revierte dos veces.
  const claimed = await prisma.slackPendingAction.updateMany({
    where: { id: pendingId, tenantId: actor.tenantId, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "CANCELLED", resolvedBy: actor.adminId, resolvedAt: new Date() },
  });
  if (claimed.count !== 1) {
    await ephemeral(payload.response_url, "⌛ Esta acción ya expiró o fue deshecha.");
    return;
  }

  const txId = (pending.toolArgs as { txId?: string } | null)?.txId;
  if (!txId) {
    await ephemeral(payload.response_url, "Acción inválida.");
    return;
  }

  try {
    await clearTransactionLinks(actor.tenantId, txId);
  } catch (err) {
    // Restaurar a PENDING para permitir reintento del undo.
    await prisma.slackPendingAction
      .updateMany({ where: { id: pendingId }, data: { status: "PENDING", resolvedBy: null, resolvedAt: null } })
      .catch(() => {});
    await ephemeral(payload.response_url, `⚠️ No se pudo deshacer: ${err instanceof Error ? err.message : "error"}`);
    return;
  }

  // Re-render del movimiento a su estado pendiente (match recomputado).
  const mv = await buildSingleMovement(actor.tenantId, txId);
  const replacement = mv
    ? renderMovementBlocks(mv)
    : resolvedMovementBlocks(txId, "Conciliación deshecha · movimiento pendiente", null);
  await updateMovementCard(actor, payload, txId, replacement);
  await logAudit({
    action: "UPDATE",
    entity: "FinanceBankTransaction",
    entityId: txId,
    tenantId: actor.tenantId,
    userId: actor.adminId,
    details: { operation: "slack_unreconcile", via: "slack" },
  });
}

export type { BankReconcileActor };
