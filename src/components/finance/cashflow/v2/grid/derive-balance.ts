/**
 * Saldo acumulado FC derivado en el cliente desde displayRows (con parches
 * optimistas ya aplicados). Replica la semántica de ancla de
 * `projection.service.ts` (buildProjection → cumulativePoints) en la rama
 * proyectada — sin snapshots de banco (esos solo viven en el server).
 *
 * Semántica del ancla (copiada del server, condición EXACTA):
 *   - Con `anchor`: buckets con `b.end.getTime() <= weekEndDate` son
 *     pre-ancla y acumulan desde `openingBalanceClp`; el primer bucket que
 *     cruza (`!crossedAnchor`) parte de `anchor.bankBalanceClp + net`; los
 *     siguientes suman `net`.
 *   - Sin `anchor`: toda la ventana acumula desde `openingBalanceClp + Σnet`
 *     (en el server el ancla implícita es "hoy" + saldo real; aquí no hay
 *     snapshots, así que la proyección pura desde opening es el equivalente
 *     client-side para la fila FC).
 *
 * Ver Bloque 0.10 F1 — no aproximar la comparación de fechas.
 */
import type {
  ProjectionAnchorInfo,
  ProjectionBucket,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import { toDate } from "../format";

/** Ingresos − egresos por bucket a partir de los `values` de las filas
 *  (displayRows: ya incluyen move/hide/amount optimistas). */
function netByBucket(rows: ProjectionRow[]): Map<string, number> {
  const nets = new Map<string, number>();
  for (const row of rows) {
    const sign = row.kind === "INCOME" ? 1 : row.kind === "EXPENSE" ? -1 : 0;
    if (sign === 0) continue;
    for (const v of row.values ?? []) {
      nets.set(v.bucketKey, (nets.get(v.bucketKey) ?? 0) + sign * v.amount);
    }
  }
  return nets;
}

export function deriveCumulative(
  buckets: ProjectionBucket[],
  rows: ProjectionRow[],
  openingBalanceClp: number,
  anchor: ProjectionAnchorInfo | null,
): { bucketKey: string; balanceClp: number }[] {
  const nets = netByBucket(rows);
  const anchorEndMs = anchor
    ? toDate(anchor.weekEndDate).getTime()
    : null;
  const anchorBalance = anchor?.bankBalanceClp ?? null;

  let running = openingBalanceClp;
  let crossedAnchor = false;
  const out: { bucketKey: string; balanceClp: number }[] = [];

  for (const b of buckets) {
    const net = nets.get(b.key) ?? 0;
    const endMs = toDate(b.end).getTime();

    // Condición EXACTA del server: `b.end.getTime() <= effAnchorDate.getTime()`.
    if (anchorEndMs != null && endMs <= anchorEndMs) {
      running += net;
      out.push({ bucketKey: b.key, balanceClp: running });
      continue;
    }

    // Primer bucket que cruza/pasa el ancla → parte del saldo ancla.
    // Sin ancla explícita, crossedAnchor queda false y caemos a running += net
    // desde opening (toda la ventana).
    if (anchorBalance != null && !crossedAnchor) {
      running = anchorBalance + net;
      crossedAnchor = true;
    } else {
      running += net;
    }
    out.push({ bucketKey: b.key, balanceClp: running });
  }

  return out;
}
