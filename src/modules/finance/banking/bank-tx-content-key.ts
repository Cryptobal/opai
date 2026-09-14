import { Decimal } from "@prisma/client/runtime/library";

/**
 * Huella de un movimiento bancario independiente del proveedor:
 * `fecha|monto|glosa|referencia`.
 *
 * Regla del ledger: la huella NUNCA descarta un movimiento en silencio.
 * Dos transferencias idénticas el mismo día son dos movimientos reales y
 * ambas deben sumar. Lo que sí hace la huella es:
 *   - CSV / cartola (sin id de proveedor): insertar exactamente
 *     `apariciones en el archivo − filas ya guardadas` por huella y día,
 *     así reimportar la misma cartola no duplica y una cartola con dos
 *     filas iguales inserta las dos.
 *   - Proveedor (con `externalId`): un id nuevo cuya huella ya existe se
 *     inserta y se marca como posible duplicado (`dupSuspectOfId`) para
 *     revisión; si además trae `balance` (saldo tras el movimiento) y ese
 *     saldo coincide con una fila ya guardada, es la MISMA operación y se
 *     descarta (dos operaciones reales nunca dejan el mismo saldo).
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

/** Fila ya guardada con cierta huella (visible u oculta). */
export interface ExistingContentRow {
  id: string;
  /** Saldo del banco tras el movimiento, si la fila lo trae. */
  balance: number | null;
}

export interface PartitionedMovement<T> {
  movement: T;
  /** Fila existente con la misma huella: se inserta igual, pero a revisar. */
  dupSuspectOfId: string | null;
}

function providerExternalId(item: { externalId?: string | null }): string {
  return (item.externalId ?? "").trim();
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Parte un lote inbound en filas a insertar y duplicados.
 *
 * Con `externalId`:
 *   - id ya visto (BD o lote) → duplicado.
 *   - `balance` igual al de una fila guardada (o ya aceptada en el lote)
 *     con la misma huella → misma operación → duplicado.
 *   - huella ya guardada y sin forma de discriminar por saldo → se inserta
 *     con `dupSuspectOfId` (posible duplicado, cuenta en el saldo).
 *   - resto → se inserta.
 * Sin `externalId` (cartola): la k-ésima aparición en el archivo se inserta
 *   solo si k > filas ya guardadas con esa huella.
 */
export function partitionInboundMovements<T extends InboundMovementLike>(args: {
  incoming: T[];
  existingExternalIds: Set<string>;
  existingContentRows: Map<string, ExistingContentRow[]>;
}): {
  toInsert: PartitionedMovement<T>[];
  duplicateCount: number;
  suspectCount: number;
} {
  const seenExternal = new Set(args.existingExternalIds);
  const fileOccurrences = new Map<string, number>();
  const acceptedBalances = new Map<string, number[]>();
  const toInsert: PartitionedMovement<T>[] = [];
  let suspectCount = 0;

  for (const item of args.incoming) {
    const ext = providerExternalId(item);
    const content = bankTxContentKey(item);
    const dbRows = args.existingContentRows.get(content) ?? [];

    if (!ext) {
      const occ = (fileOccurrences.get(content) ?? 0) + 1;
      fileOccurrences.set(content, occ);
      if (occ <= dbRows.length) continue;
      toInsert.push({ movement: item, dupSuspectOfId: null });
      continue;
    }

    if (seenExternal.has(ext)) continue;
    seenExternal.add(ext);

    const balance =
      item.balance != null && Number.isFinite(item.balance) ? item.balance : null;

    if (balance != null) {
      const dbSame = dbRows.some(
        (r) => r.balance != null && sameMoney(r.balance, balance),
      );
      const batchSame = (acceptedBalances.get(content) ?? []).some((b) =>
        sameMoney(b, balance),
      );
      if (dbSame || batchSame) continue;
    }

    const dbCanDiscriminate =
      balance != null && dbRows.length > 0 && dbRows.every((r) => r.balance != null);
    const suspectOf =
      dbRows.length > 0 && !dbCanDiscriminate ? dbRows[0]!.id : null;
    if (suspectOf) suspectCount += 1;

    toInsert.push({ movement: item, dupSuspectOfId: suspectOf });
    if (balance != null) {
      const list = acceptedBalances.get(content) ?? [];
      list.push(balance);
      acceptedBalances.set(content, list);
    }
  }

  return {
    toInsert,
    duplicateCount: args.incoming.length - toInsert.length,
    suspectCount,
  };
}

/**
 * Lectura de saldo del lote: el movimiento cronológicamente último que trae
 * `balance` (saldo tras el movimiento). Dentro del mismo día el orden del
 * array NO importa: se sigue la cadena `saldo_anterior + monto = saldo`
 * y se elige el movimiento al que ningún otro sucede. Si la cadena no
 * permite decidir (saldos incompletos), cae al último del array.
 */
export function pickLatestBalanceHint(
  movements: InboundMovementLike[],
): { asOfDate: string; balance: number } | null {
  const withBalance = movements
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.balance != null && Number.isFinite(m.balance));
  if (withBalance.length === 0) return null;

  const maxDate = withBalance.reduce(
    (acc, { m }) => (dateKey(m.transactionDate) > acc ? dateKey(m.transactionDate) : acc),
    "",
  );
  const sameDay = withBalance.filter(({ m }) => dateKey(m.transactionDate) === maxDate);
  if (sameDay.length === 1) {
    return { asOfDate: maxDate, balance: sameDay[0]!.m.balance as number };
  }

  const isFollowedBy = (x: InboundMovementLike, y: InboundMovementLike) =>
    sameMoney((y.balance as number) - y.amount, x.balance as number);
  const lasts = sameDay.filter(
    ({ m: x }) => !sameDay.some(({ m: y }) => y !== x && isFollowedBy(x, y)),
  );
  const pick =
    lasts.length === 1
      ? lasts[0]!
      : sameDay.reduce((acc, cur) => (cur.index > acc.index ? cur : acc));
  return { asOfDate: maxDate, balance: pick.m.balance as number };
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

/** Clave de agrupación de copias exactas: huella + id de proveedor. */
export function contentDuplicateGroupKey(args: {
  transactionDate: string | Date;
  amount: Decimal | number | string;
  description: string;
  reference?: string | null;
  apiTransactionId?: string | null;
}): string {
  return `${bankTxContentKey(args)}|${args.apiTransactionId ?? ""}`;
}
