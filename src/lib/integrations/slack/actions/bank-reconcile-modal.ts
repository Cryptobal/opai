/**
 * Caso B — asignación manual de cuenta contable a un movimiento sin match.
 *
 *  - `bankreconc_manual` (block_action): abre un modal con un buscador
 *     (external_select) del plan de cuentas del tenant.
 *  - `block_suggestion` (callback_id bankreconc_assign_account): alimenta ese
 *     buscador filtrando por code/name.
 *
 * El `view_submission` del modal vive en `bank-reconcile-assign.ts`.
 *
 * external_select (no static): el plan de cuentas con `acceptsEntries` puede
 * superar el tope de 100 opciones de un static_select en tenants reales (el
 * plan CL por defecto ya trae 66), así que se filtra server-side por término.
 */

import { prisma } from "@/lib/prisma";
import { shortDate, signedCLP } from "@/lib/finance/bank-movements-summary";
import { slackOpenView } from "../api";
import { getTenantForTeam } from "../workspace";
import { modalTitle } from "../modals/title";
import { resolveBankReconcileActor, type BankReconcilePayload } from "./bank-reconcile-context";

const CALLBACK_ID = "bankreconc_assign_account";
const pt = (text: string) => ({ type: "plain_text" as const, text: text.slice(0, 75), emoji: true });

/** Abre el modal de asignación manual (Caso B). */
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

  const line = `*${shortDate(tx.transactionDate.toISOString().slice(0, 10))}*  ${tx.description.trim().slice(0, 120)}  ·  *${signedCLP(tx.amount.toNumber())}*`;
  const view = {
    type: "modal",
    callback_id: CALLBACK_ID,
    title: modalTitle("Asignar cuenta"),
    submit: pt("Conciliar"),
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
        block_id: "account",
        label: pt("Cuenta contable"),
        element: {
          type: "external_select",
          action_id: "v",
          min_query_length: 0,
          placeholder: pt("Busca por código o nombre…"),
        },
      },
    ],
  };
  await slackOpenView(actor.workspace.botToken, payload.trigger_id, view).catch((e) =>
    console.error("[bankreconc] views.open falló:", e),
  );
}

/** Opciones del external_select: plan de cuentas activo con acceptsEntries. */
export async function handleBankReconcileAccountSuggestion(
  payload: { team?: { id?: string }; value?: string },
): Promise<{ options: unknown[] }> {
  const teamId = payload.team?.id;
  if (!teamId) return { options: [] };
  const tenant = await getTenantForTeam(teamId);
  if (!tenant) return { options: [] };

  const term = (payload.value ?? "").trim();
  const accounts = await prisma.financeAccountPlan.findMany({
    where: {
      tenantId: tenant.tenantId,
      isActive: true,
      acceptsEntries: true,
      ...(term
        ? { OR: [{ code: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { code: "asc" },
    take: 100,
    select: { id: true, code: true, name: true },
  });
  return {
    options: accounts.map((a) => ({ text: pt(`${a.code} · ${a.name}`), value: a.id })),
  };
}
