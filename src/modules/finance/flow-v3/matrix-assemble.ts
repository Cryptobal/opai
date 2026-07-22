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
}

export interface AssembledMatrix {
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  kpis: { saldoHoy: number; minBalance: number; minWeek: string };
}

/** Plan cash-signed: INGRESOS +, FINANCIAMIENTO tal como se tipeó, resto −. */
const planCashSign = (section: string, value: number): number =>
  section === "INGRESOS" || section === "FINANCIAMIENTO" ? value : -value;

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

  const balances = new Array<number>(n).fill(0);
  const allPast = n > 0 && currentWeek > weeks[n - 1];
  const allFuture = n > 0 && currentWeek < weeks[0];
  let ci = weeks.indexOf(currentWeek);
  if (allPast) {
    balances[n - 1] = openingBalance - (args.realNetAfterWindow ?? 0);
    for (let i = n - 2; i >= 0; i--) balances[i] = balances[i + 1] - realNet[i + 1];
    ci = n - 1;
  } else if (allFuture) {
    balances[0] = openingBalance + flows[0];
    for (let i = 1; i < n; i++) balances[i] = balances[i - 1] + flows[i];
    ci = 0;
  } else if (ci >= 0) {
    balances[ci] = openingBalance + pendingNet[ci];
    for (let i = ci + 1; i < n; i++) balances[i] = balances[i - 1] + flows[i];
    for (let i = ci - 1; i >= 0; i--) {
      const next = i === ci - 1 ? openingBalance : balances[i + 1];
      balances[i] = next - realNet[i + 1];
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

  return { rows, flows, balances, kpis: { saldoHoy: openingBalance, minBalance, minWeek } };
}
