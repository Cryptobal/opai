/**
 * Parseo de hojas Excel (.xlsx/.xlsm) para la vista previa de adjuntos.
 * Lazy-import de exceljs — no entra en el bundle del lector hasta abrir un Excel.
 */

export type XlsxPreviewSheet = {
  name: string;
  /** Filas de celdas ya stringifyadas (incluye header como fila 0 si existe). */
  rows: string[][];
  truncated: boolean;
};

export type XlsxPreview = {
  sheets: XlsxPreviewSheet[];
};

/** Tope de bytes / filas / columnas para no congelar el WebView. */
export const XLSX_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export const XLSX_PREVIEW_MAX_ROWS = 500;
export const XLSX_PREVIEW_MAX_COLS = 40;

export function isSpreadsheetAttachment(mimeType: string, filename: string): boolean {
  const mt = (mimeType || "").toLowerCase();
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  // .xls binario legacy: exceljs no lo lee; se trata como "other" en el caller.
  if (ext === "xls" && !mt.includes("spreadsheetml") && !mt.includes("openxml")) {
    return false;
  }
  if (
    mt.includes("spreadsheetml") ||
    mt === "application/vnd.ms-excel" ||
    mt.includes("excel") ||
    ext === "xlsx" ||
    ext === "xlsm"
  ) {
    return true;
  }
  return false;
}

/** Convierte un CellValue de exceljs a texto de preview. Exportado para tests. */
export function cellValueToDisplay(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    // Fecha sin hora si es medianoche UTC/local; si no, ISO corto.
    const hasTime =
      value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
    if (!hasTime) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return `${d}/${m}/${y}`;
    }
    return value.toLocaleString("es-CL");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((r) => r.text ?? "")
        .join("");
    }
    if ("text" in obj && typeof obj.text === "string") return obj.text;
    if ("result" in obj) return cellValueToDisplay(obj.result);
    if ("error" in obj && obj.error != null) return String(obj.error);
    if ("formula" in obj) return "";
  }
  return String(value);
}

type ExcelWorksheet = {
  name: string;
  rowCount: number;
  columnCount: number;
  getRow: (n: number) => {
    actualCellCount: number;
    getCell: (n: number) => { value: unknown };
  };
};

type ExcelWorkbook = {
  worksheets: ExcelWorksheet[];
};

/**
 * Carga un ArrayBuffer XLSX y devuelve hojas truncadas listas para render.
 * Lanza si exceljs no puede parsear el archivo.
 */
export async function parseXlsxPreview(buffer: ArrayBuffer): Promise<XlsxPreview> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook() as unknown as ExcelWorkbook & {
    xlsx: { load: (data: ArrayBuffer) => Promise<unknown> };
  };
  await wb.xlsx.load(buffer);

  const sheets: XlsxPreviewSheet[] = [];
  for (const ws of wb.worksheets) {
    const maxRow = Math.min(ws.rowCount || 0, XLSX_PREVIEW_MAX_ROWS);
    const colCount = Math.min(Math.max(ws.columnCount || 0, 1), XLSX_PREVIEW_MAX_COLS);
    const rows: string[][] = [];
    let lastNonEmpty = 0;

    for (let r = 1; r <= maxRow; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      let any = false;
      const cols = Math.min(Math.max(row.actualCellCount || 0, colCount), XLSX_PREVIEW_MAX_COLS);
      for (let c = 1; c <= cols; c++) {
        const text = cellValueToDisplay(row.getCell(c).value);
        if (text) any = true;
        cells.push(text);
      }
      // Normalizar ancho de fila al colCount detectado.
      while (cells.length < colCount) cells.push("");
      if (cells.length > colCount) cells.length = colCount;
      rows.push(cells);
      if (any) lastNonEmpty = rows.length;
    }

    const trimmed = rows.slice(0, lastNonEmpty);
    sheets.push({
      name: ws.name || `Hoja ${sheets.length + 1}`,
      rows: trimmed,
      truncated:
        (ws.rowCount || 0) > XLSX_PREVIEW_MAX_ROWS ||
        (ws.columnCount || 0) > XLSX_PREVIEW_MAX_COLS,
    });
  }

  if (sheets.length === 0) {
    return { sheets: [{ name: "Hoja 1", rows: [], truncated: false }] };
  }
  return { sheets };
}
