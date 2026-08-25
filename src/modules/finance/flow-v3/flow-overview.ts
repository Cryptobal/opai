/**
 * Vista compacta de la planilla de caja para MCP / chat.
 *
 * El Saldo acumulado y «Banco hoy» salen de la misma matriz v3 que
 * `/finanzas/flujo-caja/planilla` (`buildFlowMatrix` + `defaultHorizon`).
 * «Hoy» es el calendario Chile (`todayInChile`), no UTC del servidor.
 * No recortar la ventana al futuro: el promedio TE histórico usa las
 * semanas pasadas de esa ventana; si MCP arranca en la semana actual el
 * promedio (y el saldo) divergen.
 */
import type { FlowMatrixResponse } from "./matrix-types";
import { defaultHorizon } from "./weeks";

/**
 * Horizonte idéntico a la planilla: lunes(hoy Chile − 4 sem) →
 * lunes(hoy Chile + 12 meses). No usar `weekStartYmd(new Date())`
 * (UTC) ni una ventana «semana actual → +11»: cambian TE y el saldo.
 */
export function flowOverviewHorizon(today: Date = new Date()): { from: Date; to: Date } {
  return defaultHorizon(today);
}

/**
 * Columnas a imprimir en el overview: semana anterior + actual + 11 futuras
 * (el cálculo de saldos usa la matriz completa).
 */
export function overviewColumnIndices(
  columns: Array<{ weekStart: string }>,
  currentWeek: string,
  pastWeeks = 1,
  futureWeeks = 11,
): number[] {
  if (columns.length === 0) return [];
  const ci = columns.findIndex((c) => c.weekStart === currentWeek);
  const start = ci >= 0 ? Math.max(0, ci - pastWeeks) : 0;
  const end = ci >= 0 ? Math.min(columns.length - 1, ci + futureWeeks) : columns.length - 1;
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export interface FlowOverviewWeek {
  weekStart: string;
  label: string;
  isCurrent: boolean;
  isPast: boolean;
  /** Misma fila «Saldo acumulado» de la planilla. */
  saldoAcumulado: number;
  /** Misma fila «Flujo semana» de la planilla. */
  flujoSemana: number;
}

export interface FlowOverviewKpis {
  /** Footer «Banco hoy»: snapshot + cartola visible con fecha ≤ hoy (mismo día si ancla MANUAL). */
  bancoHoy: number;
  saldoHoy: number;
  openingBalance: number;
  minBalance: number;
  minWeek: string;
  warnThreshold: number;
}

export interface FlowOverviewDto {
  overview: string;
  /** Calendario Chile; misma `todayYmd` que la planilla. */
  todayYmd: string;
  /** Lunes ISO de la semana actual (Chile). */
  currentWeek: string;
  /** Ventana completa usada para armar saldos (no solo las columnas impresas). */
  horizon: { from: string; to: string };
  kpis: FlowOverviewKpis;
  weeks: FlowOverviewWeek[];
  closedWeeks: string[];
  /** Quiebres sello↔sello por columna de la matriz completa. */
  balanceBreaks: Array<{
    weekStart: string;
    label: string;
    break: { vsWeek: string; delta: number } | null;
  }>;
}

function displayValue(section: string, layer: string, raw: number): number {
  if (section === "FINANCIAMIENTO" || section === "INGRESOS") {
    return layer === "real" && section === "INGRESOS" ? Math.abs(raw) : raw;
  }
  return Math.abs(raw);
}

function colLabel(m: FlowMatrixResponse, i: number): string {
  return m.columns[i]?.label ?? String(i);
}

/** KPIs + semanas impresas (misma definición que la planilla). */
export function toFlowOverviewDto(m: FlowMatrixResponse): Omit<FlowOverviewDto, "overview"> {
  const idxs = overviewColumnIndices(m.columns, m.currentWeek);
  const bancoHoy = Math.round(m.kpis.saldoHoy);
  const horizonFrom = m.columns[0]?.weekStart ?? m.currentWeek;
  const horizonTo = m.columns[m.columns.length - 1]?.weekStart ?? m.currentWeek;
  return {
    todayYmd: m.todayYmd,
    currentWeek: m.currentWeek,
    horizon: { from: horizonFrom, to: horizonTo },
    kpis: {
      bancoHoy,
      saldoHoy: bancoHoy,
      openingBalance: Math.round(m.openingBalance),
      minBalance: Math.round(m.kpis.minBalance),
      minWeek: m.kpis.minWeek,
      warnThreshold: Math.round(m.warnThreshold),
    },
    weeks: idxs.map((i) => {
      const col = m.columns[i]!;
      return {
        weekStart: col.weekStart,
        label: col.label,
        isCurrent: col.weekStart === m.currentWeek,
        isPast: col.weekStart < m.currentWeek,
        saldoAcumulado: Math.round(m.balances[i] ?? 0),
        flujoSemana: Math.round(m.flows[i] ?? 0),
      };
    }),
    closedWeeks: [...m.closedWeeks],
    balanceBreaks: m.columns.map((col, i) => {
      const br = m.balanceBreaks[i];
      if (!br) return { weekStart: col.weekStart, label: col.label, break: null };
      return {
        weekStart: col.weekStart,
        label: col.label,
        break: { vsWeek: br.vsWeek, delta: Math.round(br.delta) },
      };
    }),
  };
}

/**
 * Texto compacto para el modelo. Las cifras de saldo coinciden con
 * «Banco hoy», «Saldo acumulado» y «Flujo semana» de la planilla.
 */
export function formatFlowOverview(m: FlowMatrixResponse): string {
  const dto = toFlowOverviewDto(m);
  const idxs = overviewColumnIndices(m.columns, m.currentWeek);
  const lines: string[] = [];
  const currentLabel = m.columns.find((c) => c.weekStart === m.currentWeek)?.label ?? m.currentWeek;

  lines.push(`Hoy: ${m.todayYmd}. Semana actual: ${m.currentWeek} (${currentLabel}).`);
  lines.push(
    `Banco hoy (footer de la planilla; ancla viva = snapshot banco + movimientos de cartola visibles con fecha ≤ hoy; el mismo día del ancla MANUAL cuenta, MATCHED a DTE no excluye): ${dto.kpis.bancoHoy} CLP.`,
  );
  lines.push(
    "Saldo acumulado (semana actual ABIERTA) = Banco hoy + pendientes (effective − real). " +
      "Futuras: acumulan effective desde esa ancla. Pasadas: sello / realNet. " +
      "No usar currentBalance de Banca si difiere — ese campo puede quedar desactualizado.",
  );
  lines.push(`Umbral alerta: ${dto.kpis.warnThreshold} CLP.`);
  lines.push(
    `KPIs: saldoHoy=${dto.kpis.saldoHoy}, mín=${dto.kpis.minBalance} (${dto.kpis.minWeek}).`,
  );
  if (m.closedWeeks.length) {
    lines.push(`Semanas selladas: ${m.closedWeeks.join(", ")}.`);
  }
  lines.push(
    `Columnas (lunes): ${idxs.map((i) => `${colLabel(m, i)}=${m.columns[i]?.weekStart}`).join(" | ")}`,
  );
  lines.push(
    `Saldo acumulado: ${dto.weeks.map((w) => `${w.label}:${w.saldoAcumulado}`).join(" | ")}`,
  );
  lines.push(
    `Flujo semana: ${dto.weeks.map((w) => `${w.label}:${w.flujoSemana}`).join(" | ")}`,
  );

  let chars = lines.join("\n").length;
  const MAX = 18_000;

  for (const section of ["INGRESOS", "REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS", "FINANCIAMIENTO"]) {
    const rows = m.rows.filter((r) => r.section === section);
    if (rows.length === 0) continue;
    lines.push(`\n## ${section}`);
    for (const row of rows) {
      if (chars > MAX) break;
      const cells = idxs
        .map((i) => {
          const c = row.cells[i];
          if (!c) return null;
          const v = displayValue(row.section, c.layer, c.effective);
          if (v === 0 && c.layer === "empty") return null;
          const tag = c.layer === "real" ? "R" : c.layer === "committed" ? "C" : c.layer === "plan" ? "P" : "-";
          return `${colLabel(m, i)}:${Math.round(v)}${tag}`;
        })
        .filter(Boolean)
        .join(", ");
      if (!cells) continue;
      const name = row.name.replace(/[\n|]/g, " ").slice(0, 60);
      const line = `- ${name}: ${cells}`;
      lines.push(line);
      chars += line.length + 1;
    }
  }

  if (m.rows.length === 0) {
    lines.push("(Sin movimientos aún en la planilla.)");
  }

  return lines.join("\n");
}
