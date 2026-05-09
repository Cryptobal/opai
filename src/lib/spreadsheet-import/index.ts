/**
 * Spreadsheet import helpers — XLSX + CSV con detección inteligente de columnas.
 *
 * Reutilizado por:
 *  - Access Control: importación de whitelist/blacklist
 *  - Inventario (futuro: refactor para consumir desde acá)
 *
 * Diseño:
 *  - Cliente-side: el navegador parsea el archivo, envía rows estructurados al server.
 *  - Server-side: se valida y persiste por lotes.
 *  - "Inteligente": acepta cualquier orden de columnas, tolera tildes/mayúsculas/
 *    espacios, soporta múltiples nombres por concepto (RUT/Run/Rol Único, etc.),
 *    y combina Nombre+Apellido si vienen separados.
 */

export type SheetRow = Record<string, unknown>;

/** Normaliza a lowercase sin tildes ni espacios extra. */
export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Busca la primera columna cuyo header contenga alguno de los patterns. */
export function findColumn(headers: string[], patterns: string[]): string | null {
  const norm = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
  for (const p of patterns) {
    const np = normalizeHeader(p);
    const hit = norm.find((h) => h.n.includes(np));
    if (hit) return hit.raw;
  }
  return null;
}

/** RFC-4180-ish CSV parser: maneja comillas, comillas duplicadas, \n, \r\n, BOM. */
export function parseCsvText(text: string): SheetRow[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cell += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      current.push(cell);
      cell = "";
    } else if (c === "\n") {
      current.push(cell);
      rows.push(current);
      current = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length > 0 || current.length > 0) {
    current.push(cell);
    rows.push(current);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((row) => {
    const obj: SheetRow = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = (row[idx] ?? "").toString().trim();
    });
    return obj;
  });
}

/** Lee un .xlsx desde un File usando exceljs (lazy import). */
export async function parseXlsxFile(file: File): Promise<SheetRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = String(cell.value ?? "").trim();
  });

  const rows: SheetRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowIdx) => {
    if (rowIdx === 1) return;
    const values = row.values as unknown[];
    const obj: SheetRow = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = values[i + 1];
      if (v == null) {
        obj[h] = "";
        return;
      }
      if (typeof v === "object" && v !== null) {
        if (v instanceof Date) obj[h] = v.toISOString().slice(0, 10);
        else if ("text" in v) obj[h] = String((v as { text: unknown }).text ?? "");
        else if ("result" in v) obj[h] = String((v as { result: unknown }).result ?? "");
        else obj[h] = String(v);
      } else {
        obj[h] = String(v);
      }
    });
    if (Object.values(obj).some((x) => String(x).trim() !== "")) rows.push(obj);
  });

  return rows;
}

/** Auto-detecta y parsea XLSX/XLS/CSV/TSV/TXT. */
export async function parseSpreadsheetFile(file: File): Promise<SheetRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    return parseXlsxFile(file);
  }
  const text = await file.text();
  const firstLine = text.split("\n")[0] || "";
  if (firstLine.includes("\t") && !firstLine.includes(",")) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const headers = lines[0].split("\t").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split("\t");
      const obj: SheetRow = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = (values[i] ?? "").trim();
      });
      return obj;
    });
  }
  return parseCsvText(text);
}

/** Normaliza fecha a YYYY-MM-DD. Acepta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. */
export function normalizeDateString(s: string): string {
  if (!s) return "";
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

/** Devuelve los headers (claves) de una lista de filas. */
export function rowsHeaders(rows: SheetRow[]): string[] {
  if (rows.length === 0) return [];
  const seen = new Set<string>();
  for (const r of rows) {
    Object.keys(r).forEach((k) => seen.add(k));
  }
  return Array.from(seen);
}
