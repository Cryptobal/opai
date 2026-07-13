/**
 * Enriquecimiento del evento `bank_cartola_received` para el canal de Slack:
 * computa el match exacto de cada movimiento recién insertado y arma los
 * `__customBlocks` (Block Kit interactivo) que consume `dispatch.ts`.
 *
 * SOLO orquesta: `findDteCandidates` decide dirección y candidatos; acá se
 * aplica la regla de "match exacto" y se delega el render al builder. No hay
 * lógica de conciliación nueva.
 */

import { prisma } from "@/lib/prisma";
import { findDteCandidates } from "./bank-tx-link.service";
import {
  buildBankMovementsBlocks,
  buildBankMovementsText,
  MAX_INLINE,
  type MovementForBlocks,
  type MovementMatch,
} from "@/lib/integrations/slack/bank-reconcile-blocks";

/** Un movimiento recién insertado, con su id de DB. `amount` en CLP con signo. */
export interface InsertedMovement {
  id: string;
  /** `@db.Date` → convertir a ISO "YYYY-MM-DD" antes de pasar acá. */
  transactionDate: string;
  description: string;
  amount: number;
}

/**
 * Regla dura de match exacto: hay match SOLO si existe un candidato cuyo
 * `amountPending` difiere del monto absoluto del movimiento en < 1 peso.
 * Los candidatos ya vienen ordenados por afinidad, así que el primero que
 * cumpla es el de menor delta. Sin candidato exacto → null (Caso B).
 */
function pickExactMatch(
  candidates: Awaited<ReturnType<typeof findDteCandidates>>,
  amount: number,
): MovementMatch | null {
  const target = Math.abs(amount);
  for (const c of candidates) {
    if (Math.abs(c.amountPending - target) < 1) {
      const counterparty =
        c.direction === "RECEIVED"
          ? c.issuerName || c.receiverName || "proveedor"
          : c.receiverName || c.issuerName || "cliente";
      return {
        dteId: c.id,
        folio: c.folio,
        dteType: c.dteType,
        direction: c.direction,
        counterpartyName: counterparty,
        amountPending: c.amountPending,
      };
    }
  }
  return null;
}

export interface BankMovementsSlackData {
  __customBlocks: unknown[];
  __customText: string;
  /** Index signature: permite spread directo en el `data` (Record) del notify. */
  [key: string]: unknown;
}

/**
 * Arma `{ __customBlocks, __customText }` para adjuntar al `data` del notify.
 *
 * Corto-circuito: si el lote supera `MAX_INLINE`, NO se llama `findDteCandidates`
 * por movimiento (evita N queries pesadas) — se devuelven todos sin match y el
 * builder cae al layout resumido "conciliá desde la web".
 */
export async function buildBankMovementsSlackData(
  tenantId: string,
  accountLabel: string,
  summary: string,
  txs: InsertedMovement[],
  accountBalanceClp?: number | null,
): Promise<BankMovementsSlackData> {
  const tooMany = txs.length > MAX_INLINE;

  const movements: MovementForBlocks[] = await Promise.all(
    txs.map(async (tx): Promise<MovementForBlocks> => {
      let match: MovementMatch | null = null;
      if (!tooMany) {
        const candidates = await findDteCandidates(tenantId, tx.id);
        match = pickExactMatch(candidates, tx.amount);
      }
      return {
        bankTxId: tx.id,
        transactionDate: tx.transactionDate,
        description: tx.description,
        amount: tx.amount,
        match,
      };
    }),
  );

  const input = { summary, accountLabel, movements, accountBalanceClp };
  return {
    __customBlocks: buildBankMovementsBlocks(input),
    __customText: buildBankMovementsText(input),
  };
}

/**
 * Rearma un solo movimiento (fecha/desc/monto + match exacto recomputado) para
 * re-renderizar su bloque tras un "Deshacer". Devuelve null si el mov no existe
 * o no pertenece al tenant (aislamiento). Revalida SIEMPRE contra `tenantId`.
 */
export async function buildSingleMovement(
  tenantId: string,
  txId: string,
): Promise<MovementForBlocks | null> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: txId, tenantId },
    select: { id: true, transactionDate: true, description: true, amount: true },
  });
  if (!tx) return null;
  const amount = tx.amount.toNumber();
  const candidates = await findDteCandidates(tenantId, tx.id);
  return {
    bankTxId: tx.id,
    transactionDate: tx.transactionDate.toISOString().slice(0, 10),
    description: tx.description,
    amount,
    match: pickExactMatch(candidates, amount),
  };
}
