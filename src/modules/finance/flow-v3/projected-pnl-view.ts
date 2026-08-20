/**
 * Etiquetas y columnas del Resultado proyectado.
 * Puro: la UI y los tests leen de acá para no volver a mezclar
 * personal + compras bajo "Costo directo".
 */

import type {
  PnlLineSeries,
  ProjectedPnlInstallationRow,
} from "./projected-pnl";

export type PnlLineId = keyof PnlLineSeries;

export interface PnlLineMeta {
  id: PnlLineId;
  label: string;
  instHint?: string;
}

export const PNL_LINE_META: PnlLineMeta[] = [
  { id: "revenue", label: "Ingresos operacionales" },
  { id: "personnel", label: "Costo de personal" },
  { id: "extraShifts", label: "Turnos extra" },
  { id: "directCost", label: "Compras de faena" },
  { id: "gav", label: "GAV", instHint: "Prorrateado por ingresos" },
  { id: "result", label: "Resultado" },
];

export type RankingColumnId =
  | "name"
  | "revenue"
  | "personnel"
  | "extraShifts"
  | "directCost"
  | "gav"
  | "result"
  | "pct";

export interface RankingColumnSpec {
  id: RankingColumnId;
  header: string;
  valueOf: (row: ProjectedPnlInstallationRow) => number | string;
}

export const RANKING_COLUMN_SPECS: RankingColumnSpec[] = [
  { id: "name", header: "Instalación", valueOf: (r) => r.name },
  { id: "revenue", header: "Ingresos", valueOf: (r) => r.totals.revenue },
  { id: "personnel", header: "Personal", valueOf: (r) => r.totals.personnel },
  { id: "extraShifts", header: "TE", valueOf: (r) => r.totals.extraShifts },
  { id: "directCost", header: "Compras de faena", valueOf: (r) => r.totals.directCost },
  { id: "gav", header: "GAV", valueOf: (r) => r.totals.gav },
  { id: "result", header: "Resultado", valueOf: (r) => r.totals.result },
  { id: "pct", header: "%", valueOf: (r) => r.totals.marginPct },
];

export interface LineContribution {
  installationId: string;
  name: string;
  monthly: number[];
  total: number;
}

/** Faenas que aportan a una línea, ordenadas por |total|. */
export function contributionsForLine(
  installations: ProjectedPnlInstallationRow[],
  lineId: PnlLineId,
): LineContribution[] {
  return installations
    .map((inst) => {
      const monthly = inst.monthly[lineId];
      const total = monthly.reduce((a, b) => a + b, 0);
      return {
        installationId: inst.installationId,
        name: inst.name,
        monthly,
        total,
      };
    })
    .filter((c) => c.monthly.some((v) => v !== 0))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
