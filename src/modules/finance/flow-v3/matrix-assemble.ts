/**
 * Ensamblado PURO de la matriz semanal (sin prisma).
 *
 * Convención cash-signed en `effective`: ingresos +, egresos −, FINANCIAMIENTO
 * signado. La UI muestra magnitudes en secciones de egreso; flujo y saldo
 * suman `effective` directo.
 *
 * Capa efectiva por celda (semana actual/futura):
 *   real > ingreso facturado (DTE) > plan manual > comprometido > vacío.
 * El plan manual pisa proyecciones (sueldos, IVA, GAV, cuotas sin factura)
 * para que "Editar monto de plan" mueva el flujo. Excepción: ingreso con
 * DTE emitido — la factura manda. Semanas pasadas: SOLO real.
 *
 * Saldo acumulado (fin de semana):
 *  - semana actual = saldo banco hoy + pendiente de la semana (capa
 *    efectiva plan/comprometido de celdas sin real);
 *  - futuras: acumula `effective`;
 *  - pasadas: des-acumula el real desde hoy hacia atrás;
 *  - ventana enteramente pasada: ancla = saldo hoy − real posterior a la
 *    ventana (`realNetAfterWindow`, lo aporta el service);
 *  - ventana enteramente futura: ancla aproximada en saldo hoy (el gap sin
 *    cargar se documenta en QA).
 *  - sellos de cierre (`sealedBalances`): el sello MANDA. Su saldo es el fin
 *    de esa semana y el INICIO de la siguiente: hacia adelante se acumula
 *    `flows` desde el sello (no desde banco-hoy). Hacia atrás, el tramo
 *    anterior deriva con `realNet`. Banco-hoy solo ancla si no hay sello
 *    en/antes de la semana actual. Descuadre ⚠ solo entre dos sellos que
 *    no cuadran (no se inventan ajustes).
 */
import { hasInvoicedIncome } from "./cell-editability";
import type { CommittedByRow, CommittedCell, RealByRow, RealCell } from "./types";

export interface AssembleRowInput {
  id: string;
  name: string;
  section: string;
  mapping: string;
  orderIndex: number;
  crmAccountId: string | null;
  installationId: string | null;
  recurringTemplateId?: string | null;
  categoryId: string | null;
  supplierId: string | null;
  isArchived: boolean;
  /** Última semana (lunes YMD) con datos visibles para filas archivadas. */
  archivedWeekCutoff: string | null;
  isVirtual: boolean;
  /**
   * Nombre canónico desde la fuente (template / cuenta·instalación /
   * categoría / proveedor). null en filas MANUAL o virtuales.
   */
  sourceName?: string | null;
  /** true si `name` difiere del canónico (alias manual de visualización). */
  nameIsManual?: boolean;
  /** Caption UF de egreso recurrente (ej. "UF 24,5"), si aplica. */
  ufCaption?: string | null;
}

export interface FlowMatrixCellDto {
  weekStart: string;
  plan: number;
  committed: CommittedCell | null;
  real: RealCell | null;
  /** Cash-signed (+ entra / − sale). */
  effective: number;
  layer: "real" | "committed" | "plan" | "empty";
  /** Magnitud proyectada (plan≠0 ? plan : |committed|) cuando hay real — drift v5. */
  projected?: number | null;
  /** Desviación real vs proyectado (solo si hay real). */
  drift?: { delta: number; pct: number | null } | null;
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
      const invoiced = hasInvoicedIncome(r.section, committed);

      const isPast = w < currentWeek;
      let layer: FlowMatrixCellDto["layer"] = "empty";
      let effective = 0;
      if (real && real.total !== 0) {
        layer = "real";
        effective = real.total;
      } else if (!isPast && invoiced && committed && committed.total !== 0) {
        // Ingreso facturado: la factura manda sobre el plan manual.
        layer = "committed";
        effective = committedCash;
      } else if (!isPast && plan !== 0) {
        // Plan manual pisa proyecciones (sueldos, impuestos, GAV, cuotas…).
        layer = "plan";
        effective = planCash;
      } else if (!isPast && committed && committed.total !== 0) {
        layer = "committed";
        effective = committedCash;
      }

      flows[i] += effective;
      if (real) realNet[i] += real.total;
      if (!isPast) {
        if (layer === "plan") pendingNet[i] += planCash;
        else if (layer === "committed") pendingNet[i] += committedCash;
      }

      const committedMag = committed?.total ?? 0;
      let projected: number | null = null;
      let drift: { delta: number; pct: number | null } | null = null;
      if (real && real.total !== 0) {
        const projSigned =
          plan !== 0 ? planCash : committed && committed.total !== 0 ? committedCash : 0;
        const projMag = plan !== 0 ? Math.abs(plan) : committedMag;
        if (projMag > 0) projected = projMag;
        if (projSigned !== 0) {
          const delta = real.total - projSigned;
          drift = { delta, pct: (delta / projSigned) * 100 };
        }
      }

      return {
        weekStart: w,
        plan,
        committed,
        real,
        effective,
        layer,
        projected,
        drift,
      };
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
  if (allPast) ci = n - 1;
  else if (allFuture) ci = 0;

  /** Flujo de la semana i para acumular saldo: real en pasado, effective en actual/futuro. */
  const weekFlow = (i: number): number =>
    weeks[i] < currentWeek ? realNet[i] : flows[i];

  /**
   * Aplica sello en `k` y propaga: atrás con realNet, adelante con weekFlow.
   * Si hay otro sello en el camino, ese valor pisa (manda).
   */
  const applySealAnchor = (k: number) => {
    balances[k] = sealedAt.get(k)!;
    for (let i = k + 1; i < n; i++) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i - 1] + weekFlow(i);
    }
    for (let i = k - 1; i >= 0; i--) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i + 1] - realNet[i + 1];
    }
  };

  // Último sello en/antes de la semana de ancla (actual / fin de ventana).
  let latestSealIdx: number | null = null;
  for (let i = 0; i <= ci && i < n; i++) {
    if (sealedAt.has(i)) latestSealIdx = i;
  }

  if (latestSealIdx != null) {
    // El sello MANDA: S_k sellada es fin de S_k e inicio de S_{k+1}.
    applySealAnchor(latestSealIdx);
    // Sellos posteriores a ci (raro) también pisan su semana y re-encadenan.
    for (let i = ci + 1; i < n; i++) {
      if (sealedAt.has(i)) {
        balances[i] = sealedAt.get(i)!;
        for (let j = i + 1; j < n; j++) {
          if (sealedAt.has(j)) balances[j] = sealedAt.get(j)!;
          else balances[j] = balances[j - 1] + weekFlow(j);
        }
      }
    }
  } else if (args.priorSealed && n > 0) {
    // Sello fuera de ventana: ancla el tramo visible hacia adelante.
    let cursor = args.priorSealed.balance;
    for (let i = 0; i < n; i++) {
      if (sealedAt.has(i)) {
        balances[i] = sealedAt.get(i)!;
      } else {
        balances[i] = cursor + weekFlow(i);
      }
      cursor = balances[i];
    }
  } else if (allPast) {
    balances[n - 1] = openingBalance - (args.realNetAfterWindow ?? 0);
    for (let i = n - 2; i >= 0; i--) balances[i] = balances[i + 1] - realNet[i + 1];
  } else if (allFuture) {
    balances[0] = openingBalance + flows[0];
    for (let i = 1; i < n; i++) balances[i] = balances[i - 1] + flows[i];
  } else if (ci >= 0) {
    // Sin sellos: ancla banco-hoy (comportamiento histórico).
    balances[ci] = openingBalance + pendingNet[ci];
    for (let i = ci + 1; i < n; i++) balances[i] = balances[i - 1] + flows[i];
    for (let i = ci - 1; i >= 0; i--) {
      const next = i === ci - 1 ? openingBalance : balances[i + 1];
      balances[i] = next - realNet[i + 1];
    }
  }

  // ⚠ solo entre dos semanas SELLADAS que no cuadran (el sello pisa la cadena).
  // No se marca descuadre sello→semana derivada: esa cadena es exacta a propósito.
  const sealIndices = [...sealedAt.keys()].sort((a, b) => a - b);
  for (let s = 1; s < sealIndices.length; s++) {
    const prev = sealIndices[s - 1];
    const cur = sealIndices[s];
    let expected = balances[prev];
    for (let i = prev + 1; i <= cur; i++) expected += weekFlow(i);
    const delta = Math.round(expected - balances[cur]);
    if (Math.abs(delta) > BREAK_TOLERANCE) {
      balanceBreaks[cur] = { vsWeek: weeks[prev], delta };
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
