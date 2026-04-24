/**
 * Helpers de exportación client-side para tablas del portal del cliente.
 *
 * - `exportToCsv`: rápida, sin dependencias, escape de coma/comilla/newline.
 * - `exportToXlsx`: usa `exceljs` (ya instalado), con estilos básicos
 *   (header en negrita, freeze panes, filas zebra).
 *
 * Ambos triggerean descarga via blob URL. SOLO exportan lo que recibas,
 * no hacen re-fetch.
 */

const isBrowser = typeof window !== "undefined";

function triggerDownload(blob: Blob, filename: string) {
  if (!isBrowser) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns: Array<{ key: string; label: string }>,
): Promise<void> {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => csvEscape(r[c.key])).join(","))
    .join("\n");
  const csv = `﻿${header}\n${body}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export async function exportToXlsx(
  filename: string,
  sheets: Array<{
    name: string;
    columns: Array<{ key: string; label: string; width?: number }>;
    rows: Record<string, unknown>[];
  }>,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPAI · Portal Cliente";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
    ws.columns = sheet.columns.map((c) => ({
      header: c.label,
      key: c.key,
      width: c.width ?? Math.max(12, c.label.length + 4),
    }));
    sheet.rows.forEach((r) => ws.addRow(r));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" }, // teal-700
    };
    headerRow.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (let r = 2; r <= ws.rowCount; r++) {
      if (r % 2 === 0) {
        ws.getRow(r).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF4F4F5" },
        };
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(
    blob,
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
}

/**
 * Limpia una cadena para usarla como parte segura del nombre de archivo.
 */
export function toFilenameSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
