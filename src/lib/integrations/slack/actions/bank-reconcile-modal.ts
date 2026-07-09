/**
 * Caso B — asignación manual de un movimiento sin match a una CATEGORÍA de
 * flujo de caja (Arriendo, Sueldo, Turno Extra, Proveedor, IVA F29…).
 *
 *  - `bankreconc_manual` (block_action): abre un modal con un `static_select`
 *     agrupado (Ingresos / Egresos) de las categorías activas del tenant.
 *
 * El `view_submission` del modal vive en `bank-reconcile-assign.ts` y delega
 * en el motor `assignBankTxToCategory` (regla "el real consume el proyectado").
 *
 * static_select (no external): con ~20-25 categorías por tenant, el estático
 * las carga TODAS sin búsqueda dinámica — elimina de raíz el `external_select`
 * que fallaba con "Ocurrió un problema al cargar las opciones". Umbral: Slack
 * admite ~100 options por select (y por grupo); si un tenant superara ~90
 * categorías habría que volver a un buscador — no aplica a este catálogo.
 */

import { prisma } from "@/lib/prisma";
import { shortDate, signedCLP } from "@/lib/finance/bank-movements-summary";
import { slackOpenView } from "../api";
import { modalTitle } from "../modals/title";
import { resolveBankReconcileActor, type BankReconcilePayload } from "./bank-reconcile-context";

const CALLBACK_ID = "bankreconc_assign_account";
const MAX_OPTIONS_PER_GROUP = 90; // margen bajo el tope práctico (~100) de Slack.
const pt = (text: string) => ({ type: "plain_text" as const, text: text.slice(0, 75), emoji: true });

/** Abre el modal de asignación manual a categoría de flujo de caja (Caso B). */
export async function handleBankReconcileManual(payload: BankReconcilePayload): Promise<void> {
  const actor = await resolveBankReconcileActor(payload);
  if (!actor || !payload.trigger_id) return;
  const txId = payload.actions?.[0]?.value;
  if (!txId) return;

  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId: actor.tenantId },
    select: { transactionDate: true, description: true, amount: true },
  });
  if (!tx) return;

  const categories = await prisma.financeCashflowCategory.findMany({
    where: { tenantId: actor.tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true },
  });
  const toOption = (c: { id: string; name: string }) => ({ text: pt(c.name), value: c.id });
  const optionGroups = [
    { label: pt("Ingresos"), kind: "INCOME" as const },
    { label: pt("Egresos"), kind: "EXPENSE" as const },
  ]
    .map((g) => ({
      label: g.label,
      options: categories.filter((c) => c.kind === g.kind).slice(0, MAX_OPTIONS_PER_GROUP).map(toOption),
    }))
    .filter((g) => g.options.length > 0);

  const line = `*${shortDate(tx.transactionDate.toISOString().slice(0, 10))}*  ${tx.description.trim().slice(0, 120)}  ·  *${signedCLP(tx.amount.toNumber())}*`;
  const view = {
    type: "modal",
    callback_id: CALLBACK_ID,
    title: modalTitle("Asignar a flujo de caja"),
    submit: pt("Asignar"),
    close: pt("Cancelar"),
    private_metadata: JSON.stringify({
      txId,
      channelId: payload.container?.channel_id ?? "",
      messageTs: payload.container?.message_ts ?? payload.message?.ts ?? "",
    }),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: line } },
      {
        type: "input",
        block_id: "category",
        label: pt("Categoría"),
        element: {
          type: "static_select",
          action_id: "v",
          placeholder: pt("Elegí una categoría…"),
          option_groups: optionGroups,
        },
      },
    ],
  };
  await slackOpenView(actor.workspace.botToken, payload.trigger_id, view).catch((e) =>
    console.error("[bankreconc] views.open falló:", e),
  );
}
