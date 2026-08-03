/**
 * Ensamblado PURO de la matriz semanal (sin prisma).
 *
 * Convención cash-signed en `effective`: ingresos +, egresos −, FINANCIAMIENTO
 * signado. La UI muestra magnitudes en secciones de egreso; flujo y saldo
 * suman `effective` directo.
 *
 * Capa efectiva por celda: real > comprometido > plan. Semanas pasadas: SOLO
 * real (sin movimiento = 0; jamás caen al plan — el plan queda para desvío).
 *
 * Saldo acumulado (fin de semana):
 *  - semana actual = saldo banco hoy + pendiente de la semana (comprometido
 *    de la semana + plan de celdas sin real ni comprometido);
 *  - futuras: acumula `effective`;
 *  - pasadas: des-acumula el real desde hoy hacia atrás;
 *  - ventana enteramente pasada: ancla = saldo hoy − real posterior a la
 *    ventana (`realNetAfterWindow`, lo aporta el service);
 *  - ventana enteramente futura: ancla aproximada en saldo hoy (el gap sin
 *    cargar se documenta en QA).
 *  - sellos de cierre (`sealedBalances`): anclan exactamente su semana; el
 *    tramo anterior deriva hacia atrás desde el sello con `realNet`.
 *    Descuadre sello↔derivado se reporta en `balanceBreaks` (no se inventan
 *    ajustes).
 */
import type { CommittedByRow, CommittedCell, RealByRow, RealCell } from "./types";

export interface AssembleRowInput {
  id: string;
  name: string;
  section: string;
  mapping: string;
  orderIndex: number;
  crmAccountId: string | null;
  installationId: string | null;
  categoryId: string | null;
  supplierId: string | null;
  isArchived: boolean;
  /** Última semana (lunes YMD) con datos visibles para filas archivadas. */
  archivedWeekCutoff: string | null;
  isVirtual: boolean;
}

export interface FlowMatrixCellDto {
  weekStart: string;
  plan: number;
  committed: CommittedCell | null;
  real: RealCell | null;
  /** Cash-signed (+ entra / − sale). */
  effective: number;
  layer: "real" | "committed" | "plan" | "empty";
}

export interface FlowMatrixRowDto extends AssembleRowInput {
  cells: FlowMatrixCellDto[];
}

/** Descuadre de saldo vs un sello de cierre (para marca ⚠ en UI). */
export interface BalanceBreak {
  /** Lunes ISO de la semana sellada contra la que descuadra. */
  vsWeek: string;
  /** `balances[vs] + flujo[esta] − balances[esta]` (signed). */
  delta: number;
}

export interface AssembleArgs {
  rows: AssembleRowInput[];
  weeks: string[];
  currentWeek: string;
  openingBalance: number;
  plan: Map<string, Map<string, number>>;
  committed: CommittedByRow;
  real: RealByRow;
  /** Σ real cash-signed de las semanas ENTRE el fin de ventana y hoy (solo
   *  ventanas enteramente pasadas). */
  realNetAfterWindow?: number;
  /** Sellos de cierre: lunes ISO → bankBalanceClp (o forced si manual). */
  sealedBalances?: Map<string, number>;
  /** Último sello previo al rango (ancla el tramo más antiguo visible). */
  priorSealed?: { mondayYmd: string; balance: number } | null;
}

export interface AssembledMatrix {
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  /** Descuadre por índice de columna (null = ok). */
  balanceBreaks: Array<BalanceBreak | null>;
  kpis: { saldoHoy: number; minBalance: number; minWeek: string };
}

/** Plan cash-signed: INGRESOS +, FINANCIAMIENTO tal como se tipeó, resto −. */
const planCashSign = (section: string, value: number): number =>
  section === "INGRESOS" || section === "FINANCIAMIENTO" ? value : -value;

const BREAK_TOLERANCE = 1;

export function assembleMatrix(args: AssembleArgs): AssembledMatrix {
  const { weeks, currentWeek, openingBalance } = args;
  const n = weeks.length;
  const flows = new Array<number>(n).fill(0);
  const realNet = new Array<number>(n).fill(0);
  const pendingNet = new Array<number>(n).fill(0);

  const rows: FlowMatrixRowDto[] = args.rows.map((r) => {
    const planRow = args.plan.get(r.id);
    const committedRow = args.committed.get(r.id);
    const realRow = args.real.get(r.id);
    const cells: FlowMatrixCellDto[] = weeks.map((w, i) => {
      const hidden = r.archivedWeekCutoff != null && w > r.archivedWeekCutoff;
      const plan = hidden ? 0 : (planRow?.get(w) ?? 0);
      const committed = hidden ? null : (committedRow?.get(w) ?? null);
      const real = hidden ? null : (realRow?.get(w) ?? null);
      const committedCash =
        committed == null ? 0 : r.section === "INGRESOS" ? committed.total : -committed.total;
      const planCash = planCashSign(r.section, plan);

      const isPast = w < currentWeek;
      let layer: FlowMatrixCellDto["layer"] = "empty";
      let effective = 0;
      if (real && real.total !== 0) {
        layer = "real";
        effective = real.total;
      } else if (!isPast && committed && committed.total !== 0) {
        layer = "committed";
        effective = committedCash;
      } else if (!isPast && plan !== 0) {
        layer = "plan";
        effective = planCash;
      }

      flows[i] += effective;
      if (real) realNet[i] += real.total;
      if (!isPast) pendingNet[i] += committedCash + (layer === "plan" ? planCash : 0);
      return { weekStart: w, plan, committed, real, effective, layer };
    });
    return { ...r, cells };
  });

  const sealedAt = new Map<number, number>();
  if (args.sealedBalances) {
    for (let i = 0; i < n; i++) {
      const s = args.sealedBalances.get(weeks[i]);
      if (s != null) sealedAt.set(i, s);
    }
  }

  const balances = new Array<number>(n).fill(0);
  const balanceBreaks: Array<BalanceBreak | null> = new Array(n).fill(null);
  const allPast = n > 0 && currentWeek > weeks[n - 1];
  const allFuture = n > 0 && currentWeek < weeks[0];
  let ci = weeks.indexOf(currentWeek);

  if (allPast) {
    // Ancla al final de ventana; sellos pisan hacia atrás.
    balances[n - 1] = sealedAt.has(n - 1)
      ? sealedAt.get(n - 1)!
      : openingBalance - (args.realNetAfterWindow ?? 0);
    for (let i = n - 2; i >= 0; i--) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i + 1] - realNet[i + 1];
    }
    ci = n - 1;
  } else if (allFuture) {
    balances[0] = sealedAt.has(0) ? sealedAt.get(0)! : openingBalance + flows[0];
    for (let i = 1; i < n; i++) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i - 1] + flows[i];
    }
    ci = 0;
  } else if (ci >= 0) {
    const naturalCurrent = openingBalance + pendingNet[ci];
    balances[ci] = sealedAt.has(ci) ? sealedAt.get(ci)! : naturalCurrent;

    for (let i = ci + 1; i < n; i++) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i - 1] + flows[i];
    }

    for (let i = ci - 1; i >= 0; i--) {
      if (sealedAt.has(i)) {
        balances[i] = sealedAt.get(i)!;
      } else {
        // Misma regla que el ancla sin sellos: la semana previa a la actual
        // des-acumula desde banco-hoy (sin pendiente), no desde balances[ci].
        const nextBase =
          i === ci - 1 && !sealedAt.has(ci) ? openingBalance : balances[i + 1];
        balances[i] = nextBase - realNet[i + 1];
      }
    }

    // Sello previo al rango: re-ancla el tramo [0 .. firstSealOrCi) caminando
    // hacia adelante desde el sello (fin de esa semana previa).
    if (args.priorSealed && !sealedAt.has(0)) {
      let firstAnchor = ci;
      for (let i = 0; i < ci; i++) {
        if (sealedAt.has(i)) {
          firstAnchor = i;
          break;
        }
      }
      let cursor = args.priorSealed.balance;
      for (let i = 0; i < firstAnchor; i++) {
        balances[i] = cursor + realNet[i];
        cursor = balances[i];
      }
    }

    // Descuadre sello ↔ siguiente (y sello actual vs banco-hoy).
    if (sealedAt.has(ci) && Math.abs(balances[ci] - naturalCurrent) > BREAK_TOLERANCE) {
      balanceBreaks[ci] = {
        vsWeek: weeks[ci],
        delta: Math.round(naturalCurrent - balances[ci]),
      };
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (!sealedAt.has(i) && !sealedAt.has(i + 1)) continue;
    // Flujo de la semana i+1: real en pasado; pending en actual; flows en futuro.
    const flujo =
      weeks[i + 1] < currentWeek
        ? realNet[i + 1]
        : weeks[i + 1] === currentWeek
          ? pendingNet[i + 1]
          : flows[i + 1];
    const delta = Math.round(balances[i] + flujo - balances[i + 1]);
    if (Math.abs(delta) > BREAK_TOLERANCE) {
      balanceBreaks[i + 1] = { vsWeek: weeks[i], delta };
    }
  }

  let minBalance = balances[ci] ?? openingBalance;
  let minWeek = weeks[ci] ?? currentWeek;
  for (let i = ci; i < n; i++) {
    if (balances[i] < minBalance) {
      minBalance = balances[i];
      minWeek = weeks[i];
    }
  }

  return {
    rows,
    flows,
    balances,
    balanceBreaks,
    kpis: { saldoHoy: openingBalance, minBalance, minWeek },
  };
}
