import { Decimal } from "@prisma/client/runtime/library";

/**
 * Huella de un movimiento bancario independiente del proveedor.
 *
 * Web4Leads promete `externalId` estable, pero en la práctica reenvía el
 * mismo cargo/abono con otro id (y a veces varias copias en el mismo POST).
 * La cartola CSV ya deduplica por contenido; esta clave alinea API + CSV.
 *
 * Con `externalId` de proveedor: la huella NO bloquea un id nuevo. El lote
 * se compara por conteo de ocurrencias (cuántas filas visibles hay en BD
 * vs cuántas trae el lote). Sin `externalId` (CSV): a lo más 1 fila por huella.
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

function providerExternalId(item: { externalId?: string | null }): string {
  return (item.externalId ?? "").trim();
}

/**
 * Parte un lote inbound.
 *
 * - `externalId` ya visto (BD o lote) → duplicado, pero igual cuenta
 *   como ocurrencia de huella en el lote (un reenvío de 7 que incluye
 *   el id ya persistido inserta los 6 restantes).
 * - `externalId` nuevo: se inserta mientras ocurrenciaEnLote > conteoEnBD
 *   de la misma huella (7 transferencias idénticas con 7 ids → 7 filas;
 *   reenvío completo → 0; reenvío con ids nuevos de un día ya cargado → 0).
 * - sin `externalId`: 1 por huella (CSV / cartola).
 */
export function partitionInboundMovements<T extends InboundMovementLike>(args: {
  incoming: T[];
  existingExternalIds: Set<string>;
  existingContentCounts: Map<string, number>;
}): { toInsert: T[]; duplicateCount: number } {
  const seenExternal = new Set(args.existingExternalIds);
  const seenInBatch = new Set<string>();
  const seenContentNoId = new Set<string>();
  const batchCounts = new Map<string, number>();
  const toInsert: T[] = [];

  for (const item of args.incoming) {
    const ext = providerExternalId(item);
    const content = bankTxContentKey(item);

    if (ext) {
      if (seenInBatch.has(ext)) continue;
      seenInBatch.add(ext);
      const batchOcc = (batchCounts.get(content) ?? 0) + 1;
      batchCounts.set(content, batchOcc);
      if (seenExternal.has(ext)) continue;
      seenExternal.add(ext);
      const dbCount = args.existingContentCounts.get(content) ?? 0;
      if (batchOcc <= dbCount) continue;
      toInsert.push(item);
      continue;
    }

    const dbCount = args.existingContentCounts.get(content) ?? 0;
    if (dbCount > 0 || seenContentNoId.has(content)) continue;
    seenContentNoId.add(content);
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

/** Clave de agrupación para ocultar duplicados: huella + id de proveedor. */
export function contentDuplicateGroupKey(args: {
  transactionDate: string | Date;
  amount: Decimal | number | string;
  description: string;
  reference?: string | null;
  apiTransactionId?: string | null;
}): string {
  return `${bankTxContentKey(args)}|${args.apiTransactionId ?? ""}`;
}
