/**
 * Export cliente de la planilla: xlsx (exceljs dinámico), CSV e imprimir.
 * Números siempre en pesos enteros completos (ignora numberFormat de vista).
 * Exporta la matriz completa cargada (ignora colapso/ceros).
 */
import { saveAs } from "file-saver";
import type { FlowMatrixResponse } from "@/modules/finance/flow-v3/matrix-types";
import { SECTION_LABELS, SECTION_ORDER, displayValue } from "./grid-classes";
import { fmtDayMonth } from "./format";

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const NUMFMT = '#,##0;[Red]-#,##0';

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(monthKey: string, granularity: "week" | "month"): string {
  if (granularity === "month") return monthKey.slice(0, 4);
  return `${MONTHS[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(2, 4)}`;
}

function weekHeader(c: FlowMatrixResponse["columns"][0], granularity: "week" | "month"): string {
  if (granularity === "month") {
    return `${MONTHS[Number(c.monthKey.slice(5, 7)) - 1]} · ${c.weekCount}s`;
  }
  return `${c.label} ${fmtDayMonth(c.weekStart)}`;
}

/** Exporta .xlsx con exceljs (import dinámico). */
export async function exportXlsx(data: FlowMatrixResponse): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "OPAI · Flujo de Caja";
  wb.created = new Date();
  const ws = wb.addWorksheet("Planilla");

  const cols = data.columns;
  // Fila 1: meses agrupados
  const monthRow = ws.addRow(["", ...cols.map((c) => monthLabel(c.monthKey, data.granularity))]);
  monthRow.font = { bold: true, size: 10 };
  // Fila 2: semanas
  const weekRow = ws.addRow(["Concepto", ...cols.map((c) => weekHeader(c, data.granularity))]);
  weekRow.font = { bold: true, size: 10 };
  weekRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FA" } };
  });

  ws.getColumn(1).width = 32;
  for (let i = 0; i < cols.length; i++) ws.getColumn(i + 2).width = 12;

  for (const sec of SECTION_ORDER) {
    const rows = data.rows.filter((r) => r.section === sec);
    if (rows.length === 0) continue;
    const secRow = ws.addRow([SECTION_LABELS[sec] ?? sec, ...cols.map(() => "")]);
    secRow.font = { bold: true, size: 10 };
    secRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAED" } };

    for (const row of rows) {
      const values = row.cells.map((cell) => {
        const v = displayValue(row.section, cell.layer, cell.effective);
        return v === 0 ? null : Math.round(v);
      });
      const dataRow = ws.addRow([row.name, ...values]);
      for (let i = 0; i < cols.length; i++) {
        const cell = dataRow.getCell(i + 2);
        cell.numFmt = NUMFMT;
        if (typeof values[i] === "number" && (values[i] as number) < 0) {
          cell.font = { color: { argb: "FFCC0000" } };
        }
      }
    }
  }

  const flowRow = ws.addRow(["Flujo semana", ...data.flows.map((v) => Math.round(v))]);
  flowRow.font = { bold: true };
  flowRow.eachCell((c, i) => { if (i > 1) c.numFmt = NUMFMT; });

  const balRow = ws.addRow(["Saldo acumulado", ...data.balances.map((v) => Math.round(v))]);
  balRow.font = { bold: true };
  balRow.eachCell((c, i) => {
    if (i > 1) {
      c.numFmt = NUMFMT;
      const v = data.balances[i - 2];
      if (v < 0) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE8E6" } };
        c.font = { bold: true, color: { argb: "FFCC0000" } };
      } else {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EA" } };
      }
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `flujo-caja-planilla-${fileStamp()}.xlsx`,
  );
}

/** Exporta CSV parseable (punto y coma, es-CL friendly). */
export function exportCsv(data: FlowMatrixResponse): void {
  const cols = data.columns;
  const lines: string[] = [];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  lines.push(["Concepto", ...cols.map((c) => weekHeader(c, data.granularity))].map(esc).join(";"));

  for (const sec of SECTION_ORDER) {
    const rows = data.rows.filter((r) => r.section === sec);
    if (rows.length === 0) continue;
    lines.push([SECTION_LABELS[sec] ?? sec, ...cols.map(() => "")].map(esc).join(";"));
    for (const row of rows) {
      const vals = row.cells.map((cell) => {
        const v = displayValue(row.section, cell.layer, cell.effective);
        return v === 0 ? "" : String(Math.round(v));
      });
      lines.push([row.name, ...vals].map(esc).join(";"));
    }
  }
  lines.push(["Flujo semana", ...data.flows.map((v) => String(Math.round(v)))].map(esc).join(";"));
  lines.push(["Saldo acumulado", ...data.balances.map((v) => String(Math.round(v)))].map(esc).join(";"));

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  saveAs(blob, `flujo-caja-planilla-${fileStamp()}.csv`);
}

/** Imprime la planilla (usa @media print del tema papel). */
export function printPlanilla(): void {
  window.print();
}
