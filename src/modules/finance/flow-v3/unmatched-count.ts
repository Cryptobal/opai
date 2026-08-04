/**
 * Contadores de la bandeja (Otros ingresos / Otros egresos). Puro — lee la
 * matriz ya ensamblada, sin queries. Cartola-first: métricas desde capa REAL.
 */
import type { FlowMatrixRowDto } from "./matrix-assemble";
import { FALLBACK_EXPENSE_NAME, FALLBACK_INCOME_NAME } from "./canonical-rows";
import { extractCanonicalRutFromBankText } from "@/modules/finance/banking/rut-extract";

export function isFallbackBandejaRow(row: {
  isVirtual?: boolean;
  name: string;
}): boolean {
  if (row.isVirtual) return true;
  return (
    row.name === FALLBACK_INCOME_NAME ||
    row.name === "Otros clientes" ||
    row.name === FALLBACK_EXPENSE_NAME ||
    row.name === "Otros gastos"
  );
}

export interface BandejaSummary {
  totalClp: number;
  distinctRutCount: number;
}

export interface BandejaRutGroupItem {
  bankTransactionId: string;
  label: string;
  monto: number;
  fecha: string;
  weekStart: string;
}

export interface BandejaRutGroup {
  rut: string;
  totalClp: number;
  items: BandejaRutGroupItem[];
}

/** Agrega movimientos REAL de filas bandeja en una sección. */
export function summarizeBandejaRow(
  rows: FlowMatrixRowDto[],
  section: string,
): BandejaSummary {
  const ruts = new Set<string>();
  let totalClp = 0;
  for (const row of rows) {
    if (!isFallbackBandejaRow(row) || row.section !== section) continue;
    for (const cell of row.cells) {
      for (const item of cell.real?.items ?? []) {
        totalClp += Math.abs(item.monto);
        const rut = extractCanonicalRutFromBankText(item.label);
        if (rut) ruts.add(rut);
      }
    }
  }
  return { totalClp, distinctRutCount: ruts.size };
}

/** RUTs agrupados desde capa real de bandeja, ordenados por monto desc. */
export function collectBandejaRutGroups(
  rows: FlowMatrixRowDto[],
  section: string,
): BandejaRutGroup[] {
  const byRut = new Map<string, BandejaRutGroup>();
  for (const row of rows) {
    if (!isFallbackBandejaRow(row) || row.section !== section) continue;
    for (const cell of row.cells) {
      for (const item of cell.real?.items ?? []) {
        const rut = extractCanonicalRutFromBankText(item.label);
        if (!rut) continue;
        const g = byRut.get(rut) ?? { rut, totalClp: 0, items: [] };
        const monto = Math.abs(item.monto);
        g.totalClp += monto;
        g.items.push({
          bankTransactionId: item.bankTransactionId,
          label: item.label,
          monto,
          fecha: item.fecha,
          weekStart: cell.weekStart,
        });
        byRut.set(rut, g);
      }
    }
  }
  return [...byRut.values()].sort((a, b) => b.totalClp - a.totalClp);
}

/** Texto del badge de sección bandeja; null si no hay nada que mostrar. */
export function bandejaBadgeText(
  summary: BandejaSummary,
  section: string,
): string | null {
  if (summary.distinctRutCount === 0 && summary.totalClp === 0) return null;
  const label = section === "INGRESOS" ? "Otros ingresos" : "Otros egresos";
  const parts: string[] = [label];
  if (summary.totalClp > 0) {
    parts.push(`$${Math.round(summary.totalClp).toLocaleString("es-CL")}`);
  }
  if (summary.distinctRutCount > 0) {
    const n = summary.distinctRutCount;
    parts.push(`${n} RUT sin regla`);
  }
  return parts.join(" · ");
}

/** DTEs (kind=dte) en una celda de bandeja — legado committed. */
export function countAssignPendingInCell(cell: {
  committed?: { items?: Array<{ kind: string }> } | null;
}): number {
  return (cell.committed?.items ?? []).filter((i) => i.kind === "dte").length;
}

/**
 * @deprecated Usar `summarizeBandejaRow` para métricas cartola-first.
 * Cuenta ítems REAL en filas bandeja (movimientos sin regla).
 */
export function countAssignPendingInWindow(
  rows: FlowMatrixRowDto[],
  section?: string,
): number {
  let n = 0;
  for (const row of rows) {
    if (!isFallbackBandejaRow(row)) continue;
    if (section && row.section !== section) continue;
    for (const cell of row.cells) {
      n += (cell.real?.items ?? []).length;
    }
  }
  return n;
}

/** Caption por celda: "N por asignar" o null. */
export function assignPendingCaption(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 por asignar" : `${n} por asignar`;
}
