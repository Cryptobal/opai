import type { XlsxSheet } from "./types";

/**
 * Construye un XLSX a partir de una o varias hojas. Header negrita, filas
 * zebra, freeze panes en fila 1.
 */
export async function toXlsx(sheets: XlsxSheet[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPAI · Portal Cliente";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 4),
    }));
    sheet.rows.forEach((r) => ws.addRow(r));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
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

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
