/**
 * Ensamblado PURO de la matriz semanal (sin prisma).
 *
 * Convención cash-signed en `effective`: ingresos +, egresos −, FINANCIAMIENTO
 * tipado (RETIRO_SOCIO / FACTORING / DEVOL_* siempre − aunque el plan crudo
 * venga como magnitud positiva). La UI muestra magnitudes en secciones de
 * egreso; flujo y saldo suman `effective` directo.
 *
 * Capa efectiva (etiqueta `layer`, semana ABIERTA):
 *   real > ingreso facturado (DTE) > plan manual > comprometido > vacío.
 * Semanas CERRADAS (cierre semanal): SOLO real — el usuario fija al cerrar.
 * El rollover de calendario (isPast) NO congela montos ni quita plan/comprometido.
 *
 * Monto efectivo (semana abierta, con residualCarryEnabled):
 *   effective = realSigned + committedNetCash + residual
 * donde residual es el remanente bruto no ejecutado (plan o hitos) y
 * committedNetCash es el pendiente neto de facturas (kind=dte). Con
 * residualCarryEnabled=false + real ≠ 0 se reproduce el legado
 * (effective = real). Ver residual.ts.
 *
 * Saldo acumulado (fin de semana) — espejo banco en vivo:
 *  - semana actual ABIERTA = saldo banco hoy + (effective − real)
 *    (= pendiente aún no movido en el banco: plan/comprometido/residual).
 *    Sellos y anclas del pasado NO pisan esta proyección.
 *  - futuras: acumulan `effective` desde esa ancla viva;
 *  - pasadas: sellos de cierre / anclas manuales mandan en su semana;
 *    el tramo sin sello deriva con `realNet`;
 *  - semana actual CERRADA: manda el sello (ya fijada al cerrar);
 *  - ventana enteramente pasada/futura: ancla en saldo hoy como antes.
 *  - Descuadre ⚠ solo entre dos sellos que no cuadran entre sí.
 *    El espejo banco-hoy de la semana actual abierta NO genera ⚠:
 *    manda el banco; la divergencia vs cadena histórica es esperada.
 */
import { hasInvoicedIncome } from "./cell-editability";
import {
  computeCellExecution,
  planCashSign,
  type CellExecution,
  type SettlementMode,
} from "./residual";
import type { CommittedByRow, CommittedCell, RealByRow, RealCell } from "./types";

export type { CellExecution, SettlementMode };

export interface AssembleRowInput {
  id: string;
  name: string;
  section: string;
  mapping: string;
  orderIndex: number;
  crmAccountId: string | null;
  installationId: string | null;
  recurringTemplateId?: string | null;
  /** @deprecated Preferir canonicalKey / cuentas del renglón. */
  categoryId: string | null;
  canonicalKey?: string | null;
  supplierId: string | null;
  isArchived: boolean;
  /** Última semana (lunes YMD) con datos visibles para filas archivadas. */
  archivedWeekCutoff: string | null;
  isVirtual: boolean;
  /**
   * Nombre canónico desde la fuente (template / cuenta·instalación /
   * cuenta primaria / proveedor). null en filas MANUAL o virtuales.
   */
  sourceName?: string | null;
  /** true si `name` difiere del canónico (alias manual de visualización). */
  nameIsManual?: boolean;
  /** Caption UF de egreso recurrente (ej. "UF 24,5"), si aplica. */
  ufCaption?: string | null;
  /** Categoría padre (subfila GAV/OTROS/IMPUESTOS). */
  parentId?: string | null;
  /** Hijos directos (0 en subfilas). */
  childCount?: number;
}

export interface FlowMatrixCellDto {
  weekStart: string;
  plan: number;
  committed: CommittedCell | null;
  real: RealCell | null;
  /** Cash-signed (+ entra / − sale). Incluye residual cuando aplica. */
  effective: number;
  layer: "real" | "committed" | "plan" | "empty";
  /** Magnitud proyectada (plan≠0 ? plan : |committed|) cuando hay real — drift v5. */
  projected?: number | null;
  /** Desviación real vs proyectado (solo si hay real). pct sobre |proyectado|. */
  drift?: { delta: number; pct: number | null } | null;
  /** Nota libre del usuario (motivo de desvío / cambio). */
  note?: string | null;
  /** Ejecución parcial / residual (null en semanas pasadas o sin proyección). */
  execution?: CellExecution | null;
}

export interface FlowMatrixRowDto extends AssembleRowInput {
  cells: FlowMatrixCellDto[];
}

/** Inconsistencia entre dos sellos de cierre (marca ⚠ en UI). */
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
  /** Notas libres por fila → semana → texto. */
  notes?: Map<string, Map<string, string>>;
  /** Liquidación por fila → semana → modo (ausencia = AUTO). */
  settlements?: Map<string, Map<string, SettlementMode>>;
  /** Si false, el real reemplaza la proyección (legado). Default true. */
  residualCarryEnabled?: boolean;
  /** Remanente bajo el cual se da por cumplida la proyección. Default 10_000. */
  residualMinClp?: number;
  /** Σ real cash-signed de las semanas ENTRE el fin de ventana y hoy (solo
   *  ventanas enteramente pasadas). */
  realNetAfterWindow?: number;
  /** Sellos de cierre: lunes ISO → bankBalanceClp (o forced si manual). */
  sealedBalances?: Map<string, number>;
  /** Último sello previo al rango (ancla el tramo más antiguo visible). */
  priorSealed?: { mondayYmd: string; balance: number } | null;
  /**
   * Lunes ISO de semanas cerradas. Congela capa/effective a solo-real.
   * Si se omite, se infiere de las claves de `sealedBalances`.
   */
  closedWeeks?: Iterable<string>;
  /**
   * Anclas manuales de saldo acumulado (lunes ISO → CLP). No congelan la
   * semana (a diferencia de `sealedBalances`): solo pisan el saldo de esa
   * semana y re-encadenan hacia adelante hasta el próximo sello/ancla.
   */
  balanceAnchors?: Map<string, number>;
}

export interface AssembledMatrix {
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  /** Inconsistencia sello↔sello por índice de columna (null = ok). */
  balanceBreaks: Array<BalanceBreak | null>;
  kpis: { saldoHoy: number; minBalance: number; minWeek: string };
}

const BREAK_TOLERANCE = 1;
const DEFAULT_RESIDUAL_MIN_CLP = 10_000;

export function assembleMatrix(args: AssembleArgs): AssembledMatrix {
  const { weeks, currentWeek, openingBalance } = args;
  const residualCarryEnabled = args.residualCarryEnabled !== false;
  const residualMinClp = args.residualMinClp ?? DEFAULT_RESIDUAL_MIN_CLP;
  const n = weeks.length;
  const flows = new Array<number>(n).fill(0);
  const realNet = new Array<number>(n).fill(0);
  const pendingNet = new Array<number>(n).fill(0);
  const closedSet = new Set<string>(args.closedWeeks ?? []);
  if (args.sealedBalances) {
    for (const monday of args.sealedBalances.keys()) closedSet.add(monday);
  }

  const rows: FlowMatrixRowDto[] = args.rows.map((r) => {
    const planRow = args.plan.get(r.id);
    const committedRow = args.committed.get(r.id);
    const realRow = args.real.get(r.id);
    const notesRow = args.notes?.get(r.id);
    const settlementsRow = args.settlements?.get(r.id);
    const cells: FlowMatrixCellDto[] = weeks.map((w, i) => {
      const hidden = r.archivedWeekCutoff != null && w > r.archivedWeekCutoff;
      const plan = hidden ? 0 : (planRow?.get(w) ?? 0);
      const committed = hidden ? null : (committedRow?.get(w) ?? null);
      const real = hidden ? null : (realRow?.get(w) ?? null);
      const note = hidden ? null : (notesRow?.get(w) ?? null);
      const settlement: SettlementMode =
        hidden ? "AUTO" : (settlementsRow?.get(w) ?? "AUTO");
      // INGRESOS: total cash-signed (+). FINANCIAMIENTO/egresos: magnitud
      // positiva en committed ⇒ resta (legado hitos/retiro). PCT_SALES en
      // FINANCIAMIENTO usa +mag egreso / −mag ingreso para respetar signo.
      const committedCash =
        committed == null ? 0 : r.section === "INGRESOS" ? committed.total : -committed.total;
      const planCash = planCashSign(r.section, plan, r.canonicalKey);
      const invoiced = hasInvoicedIncome(r.section, committed);
      const committedNet = committed
        ? committed.items
            .filter((it) => it.kind === "dte")
            .reduce((s, it) => s + it.monto, 0)
        : 0;

      const isPast = w < currentWeek;
      /** Congelada solo por cierre semanal — no por rollover de calendario. */
      const isFrozen = closedSet.has(w);
      let layer: FlowMatrixCellDto["layer"] = "empty";
      let effective = 0;
      let execution: CellExecution | null = null;

      // Etiqueta de capa (sin cambiar significado): real gana la marca.
      if (real && real.total !== 0) {
        layer = "real";
      } else if (!isFrozen && invoiced && committed && committed.total !== 0) {
        layer = "committed";
      } else if (!isFrozen && plan !== 0) {
        layer = "plan";
      } else if (!isFrozen && committed && committed.total !== 0) {
        layer = "committed";
      }

      const realSigned = real?.total ?? 0;

      if (isFrozen) {
        // Semana cerrada: el usuario ya fijó; solo real cuenta.
        effective = realSigned !== 0 ? realSigned : 0;
        execution = null;
      } else {
        const computed = computeCellExecution({
          section: r.section,
          plan,
          committedTotal: committed?.total ?? 0,
          committedNet,
          invoiced,
          realSigned,
          settlement,
          residualCarryEnabled,
          residualMinClp,
          canonicalKey: r.canonicalKey,
        });
        execution = computed.execution;
        if (layer === "empty") {
          effective = 0;
        } else {
          effective =
            realSigned + computed.committedNetCash + computed.residual;
        }
      }

      flows[i] += effective;
      if (real) realNet[i] += real.total;
      // Ancla de saldo de la semana actual = banco hoy + pendingNet[ci].
      // Solo semanas no pasadas (calendario); el saldo hacia atrás usa realNet.
      if (!isPast) pendingNet[i] += effective - realSigned;

      const committedMag = committed?.total ?? 0;
      let projected: number | null = null;
      let drift: { delta: number; pct: number | null } | null = null;
      if (real && real.total !== 0) {
        const projSigned =
          plan !== 0 ? planCash : committed && committed.total !== 0 ? committedCash : 0;
        const projMag = plan !== 0 ? Math.abs(plan) : Math.abs(committedMag);
        if (projMag > 0) projected = projMag;
        if (projSigned !== 0) {
          const delta = real.total - projSigned;
          // pct sobre magnitud: evita signo invertido en egresos/FINANCIAMIENTO.
          drift = { delta, pct: (delta / Math.abs(projSigned)) * 100 };
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
        note,
        execution,
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

  // Anclas manuales: solo historia (semanas PASADAS abiertas). No re-encadenan
  // hacia la semana actual ni el futuro — eso lo manda el espejo banco-hoy.
  if (args.balanceAnchors && args.balanceAnchors.size > 0) {
    const anchorIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!args.balanceAnchors.has(weeks[i])) continue;
      if (closedSet.has(weeks[i])) continue; // sello manda; no editable
      if (!allPast && i >= ci) continue; // actual/futuro = espejo banco
      anchorIdx.push(i);
    }
    anchorIdx.sort((a, b) => a - b);
    for (const k of anchorIdx) {
      balances[k] = args.balanceAnchors.get(weeks[k])!;
      for (let i = k + 1; i < n; i++) {
        if (!allPast && i >= ci) break;
        if (sealedAt.has(i)) break;
        if (args.balanceAnchors.has(weeks[i]) && !closedSet.has(weeks[i])) break;
        balances[i] = balances[i - 1] + weekFlow(i);
      }
    }
  }

  // Espejo en vivo: semana actual ABIERTA = banco hoy + pending.
  // Cierres/anclas del pasado no contaminan la proyección actual/futura.
  // No marcar ⚠ vs sello: banco hoy manda; la divergencia histórica es ruido.
  if (ci >= 0 && !allPast && !allFuture) {
    const currentClosed = sealedAt.has(ci) || closedSet.has(weeks[ci]!);
    if (!currentClosed) {
      balances[ci] = openingBalance + pendingNet[ci]!;
      for (let i = ci + 1; i < n; i++) {
        if (sealedAt.has(i)) balances[i] = sealedAt.get(i)!;
        else balances[i] = balances[i - 1]! + weekFlow(i);
      }
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
