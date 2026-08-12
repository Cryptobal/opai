/**
 * Reducción de la matriz semanal a columnas mensuales (v5.2).
 *
 * Plan: por mes del lunes de cada semana (sin cambio).
 * Comprometido/real: cada ítem se atribuye al mes calendario de su `fecha`
 * (fallback = lunes de su semana si falta fecha utilizable).
 *
 * Capas: misma precedencia que `assembleMatrix`, evaluada sobre los buckets
 * mensuales tras la reatribución.
 *
 * Flujo del mes = Σ effective reatribuido.
 * Saldo mensual encadenado: saldo(M) = saldo(M−1) + flujo(M), anclado en
 * banco-hoy / sellos (misma semántica que assembleMatrix).
 *
 * El saldo mensual puede diferir del saldo de la última semana de la vista
 * semanal exactamente por los ítems de semanas frontera reatribuidos
 * (esperado y correcto para la lectura calendario).
 */
import { hasInvoicedIncome } from "./cell-editability";
import { computeCellExecution, planCashSign } from "./residual";
import { monthKeyOf, monthKeyOfDate, weekLabel } from "./weeks";
import type {
  AssembledMatrix,
  BalanceBreak,
  FlowMatrixCellDto,
  FlowMatrixRowDto,
} from "./matrix-assemble";
import type { CommittedItem, RealItem } from "./types";

export interface MatrixColumn {
  /** Semana: lunes YMD · Mes: YYYY-MM. */
  key: string;
  label: string;
  monthKey: string;
  weekStart: string;
  isCurrent: boolean;
  isPast: boolean;
  /** Semanas agrupadas (1 en granularidad semanal). */
  weekCount: number;
}

export interface ReduceMonthlyOpts {
  /** Sellos de cierre: lunes ISO → bankBalanceClp. */
  sealedBalances?: Map<string, number>;
  /** Último sello previo al rango. */
  priorSealed?: { mondayYmd: string; balance: number } | null;
  /**
   * Σ real cash-signed de semanas entre fin de ventana y hoy
   * (ventanas enteramente pasadas). Misma semántica que assembleMatrix.
   */
  realNetAfterWindow?: number;
  residualCarryEnabled?: boolean;
  residualMinClp?: number;
  /** Lunes ISO cerrados; el mes se congela solo si TODAS sus semanas lo están. */
  closedWeeks?: Iterable<string>;
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const BREAK_TOLERANCE = 1;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RESIDUAL_MIN_CLP = 10_000;

export function weeklyColumns(weeks: string[], currentWeek: string): MatrixColumn[] {
  return weeks.map((w) => ({
    key: w,
    label: weekLabel(w),
    monthKey: monthKeyOf(w),
    weekStart: w,
    isCurrent: w === currentWeek,
    isPast: w < currentWeek,
    weekCount: 1,
  }));
}

/** ¿La fecha del ítem es usable para atribución mensual? */
function usableFecha(fecha: string | undefined | null): fecha is string {
  return typeof fecha === "string" && YMD_RE.test(fecha);
}

interface MonthGroup {
  key: string;
  idx: number[];
}

function buildMonthGroups(weeks: string[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  weeks.forEach((w, i) => {
    const key = monthKeyOf(w);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.idx.push(i);
    else groups.push({ key, idx: [i] });
  });
  return groups;
}

interface ItemBucket {
  plan: number;
  committedItems: CommittedItem[];
  realItems: RealItem[];
  /** Notas de semanas cuyo lunes cae en este mes. */
  notes: string[];
  /** Contador de ítems sin fecha (fallback al lunes de su semana). */
  fallbackFechaCount: number;
}

function emptyBucket(): ItemBucket {
  return { plan: 0, committedItems: [], realItems: [], notes: [], fallbackFechaCount: 0 };
}

function attributeItemsToBuckets(
  row: FlowMatrixRowDto,
  weeks: string[],
  groups: MonthGroup[],
): { buckets: Map<string, ItemBucket>; fallbackFechaCount: number } {
  const buckets = new Map<string, ItemBucket>();
  for (const g of groups) buckets.set(g.key, emptyBucket());

  // Meses destino pueden estar fuera de los grupos de columnas (ítem con
  // fecha en mes sin semanas cuyo lunes caiga ahí). Solo atribuimos a
  // columnas existentes; si el mes no está en la ventana, el ítem se omite
  // del rollup visible (igual que un ítem fuera de weeks en semanal).
  let fallbackFechaCount = 0;

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i]!;
    const weekMonth = monthKeyOf(week);
    const cell = row.cells[i];
    if (!cell) continue;

    const planBucket = buckets.get(weekMonth);
    if (planBucket) {
      planBucket.plan += cell.plan;
      if (cell.note?.trim()) planBucket.notes.push(cell.note.trim());
    }

    if (cell.committed) {
      if (cell.committed.items.length === 0 && cell.committed.total !== 0) {
        // Celda sin ítems tipados: fallback al mes del lunes.
        const b = buckets.get(weekMonth);
        if (b) {
          b.committedItems.push({
            kind: "scheduled",
            label: "(sin detalle)",
            fecha: week,
            monto: cell.committed.total,
          });
          b.fallbackFechaCount += 1;
          fallbackFechaCount += 1;
        }
      } else {
        for (const item of cell.committed.items) {
          const mk = usableFecha(item.fecha) ? monthKeyOfDate(item.fecha) : weekMonth;
          if (!usableFecha(item.fecha)) {
            fallbackFechaCount += 1;
          }
          const b = buckets.get(mk);
          if (b) {
            b.committedItems.push(item);
            if (!usableFecha(item.fecha)) b.fallbackFechaCount += 1;
          }
        }
      }
    }

    if (cell.real) {
      if (cell.real.items.length === 0 && cell.real.total !== 0) {
        const b = buckets.get(weekMonth);
        if (b) {
          b.realItems.push({
            bankTransactionId: `fallback-${week}`,
            label: "(sin detalle)",
            fecha: week,
            monto: cell.real.total,
          });
          b.fallbackFechaCount += 1;
          fallbackFechaCount += 1;
        }
      } else {
        for (const item of cell.real.items) {
          const mk = usableFecha(item.fecha) ? monthKeyOfDate(item.fecha) : weekMonth;
          if (!usableFecha(item.fecha)) {
            fallbackFechaCount += 1;
          }
          const b = buckets.get(mk);
          if (b) {
            b.realItems.push(item);
            if (!usableFecha(item.fecha)) b.fallbackFechaCount += 1;
          }
        }
      }
    }
  }

  return { buckets, fallbackFechaCount };
}

function cellFromBucket(
  bucket: ItemBucket,
  weekStart: string,
  section: string,
  isFrozen: boolean,
  residualCarryEnabled: boolean,
  residualMinClp: number,
): FlowMatrixCellDto {
  const committedTotal = bucket.committedItems.reduce((s, i) => s + i.monto, 0);
  const realTotal = bucket.realItems.reduce((s, i) => s + i.monto, 0);
  const committed =
    bucket.committedItems.length > 0
      ? { total: committedTotal, items: bucket.committedItems }
      : null;
  const real =
    bucket.realItems.length > 0 ? { total: realTotal, items: bucket.realItems } : null;

  const committedCash =
    committed == null ? 0 : section === "INGRESOS" ? committed.total : -committed.total;
  const planCash = planCashSign(section, bucket.plan);
  const invoiced = hasInvoicedIncome(section, committed);
  const committedNet = bucket.committedItems
    .filter((it) => it.kind === "dte")
    .reduce((s, it) => s + it.monto, 0);

  let layer: FlowMatrixCellDto["layer"] = "empty";
  if (real && real.total !== 0) {
    layer = "real";
  } else if (!isFrozen && invoiced && committed && committed.total !== 0) {
    layer = "committed";
  } else if (!isFrozen && bucket.plan !== 0) {
    layer = "plan";
  } else if (!isFrozen && committed && committed.total !== 0) {
    layer = "committed";
  }

  const realSigned = real?.total ?? 0;
  let effective = 0;
  // Mensual: sin barra de execution (agregado); sí aplica residual al monto.
  if (isFrozen) {
    effective = realSigned !== 0 ? realSigned : 0;
  } else if (layer !== "empty") {
    const computed = computeCellExecution({
      section,
      plan: bucket.plan,
      committedTotal,
      committedNet,
      invoiced,
      realSigned,
      settlement: "AUTO",
      residualCarryEnabled,
      residualMinClp,
    });
    effective = realSigned + computed.committedNetCash + computed.residual;
  }

  let projected: number | null = null;
  let drift: { delta: number; pct: number | null } | null = null;
  if (real && real.total !== 0) {
    const projSigned =
      bucket.plan !== 0 ? planCash : committed && committed.total !== 0 ? committedCash : 0;
    const projMag = bucket.plan !== 0 ? Math.abs(bucket.plan) : Math.abs(committed?.total ?? 0);
    if (projMag > 0) projected = projMag;
    if (projSigned !== 0) {
      const delta = real.total - projSigned;
      drift = { delta, pct: (delta / Math.abs(projSigned)) * 100 };
    }
  }

  return {
    weekStart,
    plan: bucket.plan,
    committed,
    real,
    effective,
    layer,
    projected,
    drift,
    note: bucket.notes.length > 0 ? bucket.notes.join(" · ") : null,
    execution: null,
  };
}

function chainMonthlyBalances(args: {
  monthKeys: string[];
  weeks: string[];
  groups: MonthGroup[];
  currentWeek: string;
  openingBalance: number;
  flows: number[];
  pendingNet: number[];
  sealedBalances?: Map<string, number>;
  priorSealed?: { mondayYmd: string; balance: number } | null;
  realNetAfterWindow?: number;
}): { balances: number[]; balanceBreaks: Array<BalanceBreak | null> } {
  const {
    monthKeys,
    weeks,
    groups,
    currentWeek,
    openingBalance,
    flows,
    pendingNet,
    sealedBalances,
    priorSealed,
    realNetAfterWindow,
  } = args;
  const n = monthKeys.length;
  const balances = new Array<number>(n).fill(0);
  const balanceBreaks: Array<BalanceBreak | null> = new Array(n).fill(null);

  // Sellos → mes del lunes; si hay varios en el mes, manda el último.
  const sealedAt = new Map<number, number>();
  if (sealedBalances) {
    const lastSealWeek = new Map<number, string>();
    for (const [monday, bal] of sealedBalances) {
      const mk = monthKeyOf(monday);
      const mi = monthKeys.indexOf(mk);
      if (mi < 0) continue;
      const prev = lastSealWeek.get(mi);
      if (prev == null || monday >= prev) {
        lastSealWeek.set(mi, monday);
        sealedAt.set(mi, bal);
      }
    }
  }

  const allPast = n > 0 && currentWeek > weeks[weeks.length - 1]!;
  const allFuture = n > 0 && currentWeek < weeks[0]!;
  let ci = groups.findIndex((g) => g.idx.some((i) => weeks[i] === currentWeek));
  if (ci < 0) {
    if (allPast) ci = n - 1;
    else if (allFuture) ci = 0;
  }

  const applySealAnchor = (k: number) => {
    balances[k] = sealedAt.get(k)!;
    for (let i = k + 1; i < n; i++) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i - 1]! + flows[i]!;
    }
    for (let i = k - 1; i >= 0; i--) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i + 1]! - flows[i + 1]!;
    }
  };

  let latestSealIdx: number | null = null;
  for (let i = 0; i <= ci && i < n; i++) {
    if (sealedAt.has(i)) latestSealIdx = i;
  }

  if (latestSealIdx != null) {
    applySealAnchor(latestSealIdx);
    for (let i = ci + 1; i < n; i++) {
      if (sealedAt.has(i)) {
        balances[i] = sealedAt.get(i)!;
        for (let j = i + 1; j < n; j++) {
          if (sealedAt.has(j)) balances[j] = sealedAt.get(j)!;
          else balances[j] = balances[j - 1]! + flows[j]!;
        }
      }
    }
  } else if (priorSealed && n > 0) {
    let cursor = priorSealed.balance;
    for (let i = 0; i < n; i++) {
      if (sealedAt.has(i)) {
        balances[i] = sealedAt.get(i)!;
      } else {
        balances[i] = cursor + flows[i]!;
      }
      cursor = balances[i]!;
    }
  } else if (allPast) {
    balances[n - 1] = openingBalance - (realNetAfterWindow ?? 0);
    for (let i = n - 2; i >= 0; i--) balances[i] = balances[i + 1]! - flows[i + 1]!;
  } else if (allFuture) {
    balances[0] = openingBalance + flows[0]!;
    for (let i = 1; i < n; i++) balances[i] = balances[i - 1]! + flows[i]!;
  } else if (ci >= 0) {
    balances[ci] = openingBalance + pendingNet[ci]!;
    for (let i = ci + 1; i < n; i++) balances[i] = balances[i - 1]! + flows[i]!;
    for (let i = ci - 1; i >= 0; i--) {
      const next = i === ci - 1 ? openingBalance : balances[i + 1]!;
      balances[i] = next - flows[i + 1]!;
    }
  }

  // Espejo banco en vivo (igual que semanal): mes de la semana actual abierto
  // re-ancla en banco hoy + pending; sellos del pasado no pisan la proyección.
  if (ci >= 0 && !allPast && !allFuture && !sealedAt.has(ci)) {
    const fromChain = balances[ci]!;
    balances[ci] = openingBalance + pendingNet[ci]!;
    if (latestSealIdx != null) {
      const delta = Math.round(fromChain - balances[ci]!);
      if (Math.abs(delta) > BREAK_TOLERANCE) {
        const vsWeek =
          groups[latestSealIdx]!.idx.map((i) => weeks[i]!).sort().at(-1) ??
          monthKeys[latestSealIdx]!;
        balanceBreaks[ci] = { vsWeek, delta };
      }
    }
    for (let i = ci + 1; i < n; i++) {
      if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
      else balances[i] = balances[i - 1]! + flows[i]!;
    }
  }

  const sealIndices = [...sealedAt.keys()].sort((a, b) => a - b);
  for (let s = 1; s < sealIndices.length; s++) {
    const prev = sealIndices[s - 1]!;
    const cur = sealIndices[s]!;
    let expected = balances[prev]!;
    for (let i = prev + 1; i <= cur; i++) expected += flows[i]!;
    const delta = Math.round(expected - balances[cur]!);
    if (Math.abs(delta) > BREAK_TOLERANCE) {
      const vsWeek = groups[prev]!.idx.map((i) => weeks[i]!).sort().at(-1) ?? monthKeys[prev]!;
      balanceBreaks[cur] = { vsWeek, delta };
    }
  }

  return { balances, balanceBreaks };
}

export function reduceMonthly(
  weeks: string[],
  currentWeek: string,
  m: AssembledMatrix,
  opts: ReduceMonthlyOpts = {},
): {
  columns: MatrixColumn[];
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  balanceBreaks: AssembledMatrix["balanceBreaks"];
  /** Ítems sin fecha usable atribuidos por fallback al lunes de su semana. */
  fallbackFechaCount: number;
} {
  const groups = buildMonthGroups(weeks);
  const openingBalance = m.kpis.saldoHoy;

  const columns: MatrixColumn[] = groups.map((g) => {
    const [y, mo] = g.key.split("-").map(Number);
    const inWeeks = g.idx.map((i) => weeks[i]!);
    return {
      key: g.key,
      label: `${MONTHS[mo! - 1]} ${y}`,
      monthKey: g.key,
      weekStart: inWeeks[0]!,
      isCurrent: inWeeks.includes(currentWeek),
      isPast: inWeeks[inWeeks.length - 1]! < currentWeek,
      weekCount: inWeeks.length,
    };
  });

  let fallbackFechaCount = 0;
  const n = groups.length;
  const flows = new Array<number>(n).fill(0);
  const pendingNet = new Array<number>(n).fill(0);
  const residualCarryEnabled = opts.residualCarryEnabled !== false;
  const residualMinClp = opts.residualMinClp ?? DEFAULT_RESIDUAL_MIN_CLP;
  const closedSet = new Set<string>(opts.closedWeeks ?? []);
  if (opts.sealedBalances) {
    for (const monday of opts.sealedBalances.keys()) closedSet.add(monday);
  }

  const rows: FlowMatrixRowDto[] = m.rows.map((r) => {
    const { buckets, fallbackFechaCount: fc } = attributeItemsToBuckets(r, weeks, groups);
    fallbackFechaCount += fc;
    const cells: FlowMatrixCellDto[] = groups.map((g, mi) => {
      const bucket = buckets.get(g.key) ?? emptyBucket();
      const inWeeks = g.idx.map((i) => weeks[i]!);
      const isFrozen =
        inWeeks.length > 0 && inWeeks.every((w) => closedSet.has(w));
      const cell = cellFromBucket(
        bucket,
        columns[mi]!.weekStart,
        r.section,
        isFrozen,
        residualCarryEnabled,
        residualMinClp,
      );
      flows[mi]! += cell.effective;
      if (!columns[mi]!.isPast) {
        pendingNet[mi]! += cell.effective - (cell.real?.total ?? 0);
      }
      return cell;
    });
    return { ...r, cells };
  });

  const { balances, balanceBreaks } = chainMonthlyBalances({
    monthKeys: groups.map((g) => g.key),
    weeks,
    groups,
    currentWeek,
    openingBalance,
    flows,
    pendingNet,
    sealedBalances: opts.sealedBalances,
    priorSealed: opts.priorSealed,
    realNetAfterWindow: opts.realNetAfterWindow,
  });

  return { columns, rows, flows, balances, balanceBreaks, fallbackFechaCount };
}
