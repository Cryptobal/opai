/**
 * Contadores de la bandeja (Otros ingresos / Otros egresos). Puro — lee la
 * matriz ya ensamblada, sin queries. Cartola-first: métricas desde capa REAL.
 */
import type { FlowMatrixRowDto } from "./matrix-assemble";
import { FALLBACK_EXPENSE_NAME, FALLBACK_INCOME_NAME } from "./canonical-rows";
import { extractCanonicalRutFromBankText } from "@/modules/finance/banking/rut-extract";
import { deriveMerchantKey } from "@/modules/finance/banking/merchant-key";
import { formatRut } from "@/lib/chile-rut";

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
  distinctGroupCount: number;
  itemCount: number;
}

export type BandejaGroupKind = "RUT" | "MERCHANT" | "OTHER";

export interface BandejaGroupItem {
  bankTransactionId: string;
  label: string;
  monto: number;
  fecha: string;
  weekStart: string;
}

export interface BandejaGroup {
  /** RUT canónico | "M:<needle>" | "__other__" */
  key: string;
  kind: BandejaGroupKind;
  /** RUT formateado | needle | "Sin patrón reconocible" */
  label: string;
  /** Needle sugerido para la regla; null en OTHER */
  needle: string | null;
  totalClp: number;
  items: BandejaGroupItem[];
}

function pushItem(
  map: Map<string, BandejaGroup>,
  key: string,
  kind: BandejaGroupKind,
  label: string,
  needle: string | null,
  item: BandejaGroupItem,
): void {
  const g = map.get(key) ?? {
    key,
    kind,
    label,
    needle,
    totalClp: 0,
    items: [],
  };
  g.totalClp += item.monto;
  g.items.push(item);
  map.set(key, g);
}

/** Agrega movimientos REAL de filas bandeja en una sección. */
export function summarizeBandejaRow(
  rows: FlowMatrixRowDto[],
  section: string,
): BandejaSummary {
  const groups = collectBandejaGroups(rows, section);
  const ruts = new Set(groups.filter((g) => g.kind === "RUT").map((g) => g.key));
  let totalClp = 0;
  let itemCount = 0;
  for (const g of groups) {
    totalClp += g.totalClp;
    itemCount += g.items.length;
  }
  return {
    totalClp,
    distinctRutCount: ruts.size,
    distinctGroupCount: groups.length,
    itemCount,
  };
}

/**
 * Agrupa ítems REAL de bandeja: RUT → MERCHANT → OTHER.
 * Ordenados por monto desc. Ningún ítem queda fuera de un grupo.
 */
export function collectBandejaGroups(
  rows: FlowMatrixRowDto[],
  section: string,
): BandejaGroup[] {
  const byKey = new Map<string, BandejaGroup>();
  for (const row of rows) {
    if (!isFallbackBandejaRow(row) || row.section !== section) continue;
    for (const cell of row.cells) {
      for (const item of cell.real?.items ?? []) {
        const monto = Math.abs(item.monto);
        const groupItem: BandejaGroupItem = {
          bankTransactionId: item.bankTransactionId,
          label: item.label,
          monto,
          fecha: item.fecha,
          weekStart: cell.weekStart,
        };
        const rut = extractCanonicalRutFromBankText(item.label);
        if (rut) {
          pushItem(byKey, rut, "RUT", formatRut(rut), rut, groupItem);
          continue;
        }
        const merchant = deriveMerchantKey(item.label);
        if (merchant) {
          pushItem(
            byKey,
            merchant.key,
            "MERCHANT",
            merchant.label,
            merchant.needle,
            groupItem,
          );
          continue;
        }
        pushItem(
          byKey,
          "__other__",
          "OTHER",
          "Sin patrón reconocible",
          null,
          groupItem,
        );
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalClp - a.totalClp);
}

/** Texto corto del badge de sección bandeja; null si no hay nada que mostrar. */
export function bandejaBadgeText(
  summary: BandejaSummary,
  _section: string,
): string | null {
  if (summary.distinctGroupCount === 0 && summary.totalClp === 0) return null;
  return `Sin clasificar · ${summary.itemCount}`;
}

/** Title/tooltip del badge: texto corto + monto (si hay). */
export function bandejaBadgeTitle(
  summary: BandejaSummary,
  section: string,
): string | null {
  const text = bandejaBadgeText(summary, section);
  if (!text) return null;
  if (summary.totalClp <= 0) return text;
  return `${text} · $${Math.round(summary.totalClp).toLocaleString("es-CL")}`;
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
