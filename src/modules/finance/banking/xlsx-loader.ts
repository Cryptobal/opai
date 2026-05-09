/**
 * Loader XLSX tolerante: lee la grilla cruda (filas/celdas) de cualquier
 * archivo XLSX, incluyendo variantes no-estándar como las que entrega
 * Santander Chile (Historial de Cuenta), donde:
 *   - `xl/_rels/workbook.xml.rels` usa Target absoluto (`/xl/worksheets/sheet.xml`)
 *   - El archivo de hoja se llama `sheet.xml` (sin número)
 *   - Estilos/colSpans propios
 *
 * exceljs falla con estas variantes ("Cannot read properties of undefined (reading 'sheets')").
 * Usamos JSZip + fast-xml-parser (ya en package.json) en vez de añadir SheetJS.
 *
 * Sólo lectura — para escritura seguimos usando exceljs.
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type XlsxCell = string | number | null;
export type XlsxRows = XlsxCell[][];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Santander emite XLSX con prefijo de namespace `x:` (ej. <x:row>, <x:c>).
  // Lo eliminamos para tratarlo igual que un XLSX estándar.
  removeNSPrefix: true,
  // Mantener arrays para celdas y filas siempre (aunque haya una sola)
  isArray: (name) => ["row", "c"].includes(name),
  parseTagValue: false,
  trimValues: false,
});

/** Convierte "A1" → 0, "B1" → 1, "AA1" → 26. */
function colIndexFromRef(ref: string): number {
  const match = ref.match(/^([A-Z]+)/);
  if (!match) return 0;
  const letters = match[1];
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

/** Extrae texto de un nodo de sharedStrings (puede ser string o tener runs <r><t>). */
function extractSharedStringText(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const obj = item as Record<string, unknown>;
  // Caso simple: <si><t>texto</t></si>
  if ("t" in obj) {
    const t = obj.t;
    if (typeof t === "string") return t;
    if (t && typeof t === "object" && "#text" in (t as object)) {
      return String((t as { "#text": unknown })["#text"] ?? "");
    }
  }
  // Caso con rich-text runs: <si><r><t>...</t></r><r><t>...</t></r></si>
  if ("r" in obj) {
    const runs = obj.r;
    const arr = Array.isArray(runs) ? runs : [runs];
    return arr
      .map((run) => {
        if (run && typeof run === "object" && "t" in (run as object)) {
          const t = (run as { t: unknown }).t;
          if (typeof t === "string") return t;
          if (t && typeof t === "object" && "#text" in (t as object)) {
            return String((t as { "#text": unknown })["#text"] ?? "");
          }
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * Parsea un XLSX (Buffer / ArrayBuffer / Uint8Array) y devuelve la primera hoja
 * como matriz de filas. Cada celda es string | number | null.
 *
 * Devuelve { rows: [], sheetName: null } si no se encuentra una hoja parseable.
 */
export async function loadXlsxRows(
  input: Buffer | ArrayBuffer | Uint8Array
): Promise<{ rows: XlsxRows; sheetName: string | null }> {
  const zip = await JSZip.loadAsync(input);

  // 1) Resolver shared strings (si existen)
  const sharedStrings: string[] = [];
  const sharedStringsFile =
    zip.file("xl/sharedStrings.xml") || zip.file("/xl/sharedStrings.xml");
  if (sharedStringsFile) {
    const xml = await sharedStringsFile.async("string");
    const parsed = xmlParser.parse(xml) as {
      sst?: { si?: unknown | unknown[] };
    };
    const items = parsed.sst?.si;
    const arr = Array.isArray(items) ? items : items ? [items] : [];
    for (const item of arr) {
      sharedStrings.push(extractSharedStringText(item));
    }
  }

  // 2) Ubicar el archivo de hoja. Santander usa "xl/worksheets/sheet.xml";
  //    el estándar usa "xl/worksheets/sheet1.xml". Probamos ambos y caemos a
  //    la primera coincidencia bajo "xl/worksheets/".
  const sheetCandidates = [
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet.xml",
  ];
  let sheetXml: string | null = null;
  let sheetPath: string | null = null;
  for (const candidate of sheetCandidates) {
    const f = zip.file(candidate);
    if (f) {
      sheetXml = await f.async("string");
      sheetPath = candidate;
      break;
    }
  }
  if (!sheetXml) {
    // Búsqueda flexible: cualquier archivo bajo xl/worksheets/*.xml
    const matches = zip.file(/^xl\/worksheets\/.+\.xml$/);
    if (matches.length > 0) {
      sheetXml = await matches[0].async("string");
      sheetPath = matches[0].name;
    }
  }
  if (!sheetXml) {
    return { rows: [], sheetName: null };
  }

  // 3) Parsear filas/celdas
  const parsed = xmlParser.parse(sheetXml) as {
    worksheet?: {
      sheetData?: {
        row?: unknown[];
      };
    };
  };
  const rawRows = parsed.worksheet?.sheetData?.row ?? [];
  const rows: XlsxRows = [];

  for (const rawRow of rawRows) {
    if (!rawRow || typeof rawRow !== "object") continue;
    const row = rawRow as Record<string, unknown>;
    const cells = (row.c as unknown[]) ?? [];
    const rowArr: XlsxCell[] = [];

    for (const rawCell of cells) {
      if (!rawCell || typeof rawCell !== "object") continue;
      const cell = rawCell as Record<string, unknown>;
      const ref = String(cell["@_r"] ?? "");
      const type = String(cell["@_t"] ?? "");
      const colIdx = ref ? colIndexFromRef(ref) : rowArr.length;

      // Pad with nulls hasta colIdx
      while (rowArr.length < colIdx) rowArr.push(null);

      let value: XlsxCell = null;
      const vRaw = cell.v;
      const v =
        typeof vRaw === "string"
          ? vRaw
          : vRaw && typeof vRaw === "object" && "#text" in (vRaw as object)
            ? String((vRaw as { "#text": unknown })["#text"] ?? "")
            : vRaw != null
              ? String(vRaw)
              : "";

      if (type === "s") {
        // Shared string
        const idx = parseInt(v, 10);
        value = Number.isFinite(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : "";
      } else if (type === "inlineStr") {
        // Inline string: <c t="inlineStr"><is><t>texto</t></is></c>
        const is = cell.is;
        value = is ? extractSharedStringText(is) : "";
      } else if (type === "b") {
        // Boolean
        value = v === "1" ? "TRUE" : "FALSE";
      } else if (type === "str" || type === "e") {
        value = v;
      } else if (v !== "") {
        // Por defecto numérico
        const num = Number(v);
        value = Number.isFinite(num) ? num : v;
      }

      rowArr.push(value);
    }
    rows.push(rowArr);
  }

  return { rows, sheetName: sheetPath };
}
