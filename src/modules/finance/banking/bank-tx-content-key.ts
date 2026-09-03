import { Decimal } from "@prisma/client/runtime/library";

/**
 * Huella de un movimiento bancario independiente del proveedor.
 *
 * Web4Leads promete `externalId` estable, pero en la práctica reenvía el
 * mismo cargo/abono con otro id (y a veces varias copias en el mismo POST).
 * La cartola CSV ya deduplica por contenido; esta clave alinea API + CSV.
 *
 * No incluye un índice de ocurrencia: un (fecha, monto, glosa, referencia)
 * visible por cuenta es un solo movimiento económico. Dos transferencias
 * idénticas el mismo día al mismo destinatario son raras; se pueden restaurar
 * a mano si hace falta.
 */
export function bankTxContentKey(input: {
  transactionDate: string | Date;
  amount: Decimal | number | string;
  description: string;
  reference?: string | null;
}): string {
  return [
    dateKey(input.transactionDate),
    amountKey(input.amount),
    (input.description ?? "").trim(),
    (input.reference ?? "").trim(),
  ].join("|");
}

export function dateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function amountKey(value: Decimal | number | string): string {
  return new Decimal(value.toString()).toFixed(2);
}

export interface InboundMovementLike {
  externalId: string;
  transactionDate: string;
  description: string;
  reference?: string | null;
  amount: number;
  balance?: number | null;
}

/**
 * Parte un lote inbound: se inserta si el externalId es nuevo Y la huella
 * de contenido no existe ya (en BD ni más arriba en el mismo lote).
 */
export function partitionInboundMovements<T extends InboundMovementLike>(args: {
  incoming: T[];
  existingExternalIds: Set<string>;
  existingContentKeys: Set<string>;
}): { toInsert: T[]; duplicateCount: number } {
  const seenExternal = new Set(args.existingExternalIds);
  const seenContent = new Set(args.existingContentKeys);
  const toInsert: T[] = [];

  for (const item of args.incoming) {
    const ext = item.externalId;
    const content = bankTxContentKey(item);
    if (seenExternal.has(ext) || seenContent.has(content)) {
      continue;
    }
    seenExternal.add(ext);
    seenContent.add(content);
    toInsert.push(item);
  }

  return {
    toInsert,
    duplicateCount: args.incoming.length - toInsert.length,
  };
}

/** El movimiento más reciente que trae saldo de cuenta (documentado por Web4Leads). */
export function pickLatestBalanceHint(
  movements: InboundMovementLike[],
): { asOfDate: string; balance: number } | null {
  let best: { asOfDate: string; balance: number; index: number } | null = null;
  for (let i = 0; i < movements.length; i++) {
    const m = movements[i]!;
    if (m.balance == null || !Number.isFinite(m.balance)) continue;
    const asOfDate = dateKey(m.transactionDate);
    if (
      !best ||
      asOfDate > best.asOfDate ||
      (asOfDate === best.asOfDate && i > best.index)
    ) {
      best = { asOfDate, balance: m.balance, index: i };
    }
  }
  return best ? { asOfDate: best.asOfDate, balance: best.balance } : null;
}

export type DedupeCandidate = {
  id: string;
  createdAt: Date;
  reconciliationStatus: string;
};

/**
 * Conserva 1 fila por grupo: MATCHED gana (ya tiene conciliación),
 * luego la más antigua.
 */
export function pickContentDuplicateKeeper(rows: DedupeCandidate[]): string {
  if (rows.length === 0) {
    throw new Error("pickContentDuplicateKeeper: grupo vacío");
  }
  const ranked = [...rows].sort((a, b) => {
    const aMatched = a.reconciliationStatus === "MATCHED" ? 0 : 1;
    const bMatched = b.reconciliationStatus === "MATCHED" ? 0 : 1;
    if (aMatched !== bMatched) return aMatched - bMatched;
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
  return ranked[0]!.id;
}

