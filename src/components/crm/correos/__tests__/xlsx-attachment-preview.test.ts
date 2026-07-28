import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  cellValueToDisplay,
  isSpreadsheetAttachment,
  parseXlsxPreview,
} from "../xlsx-attachment-preview";

describe("isSpreadsheetAttachment", () => {
  it("detecta xlsx por extensión aunque el MIME sea genérico", () => {
    expect(
      isSpreadsheetAttachment("application/octet-stream", "cotizacion.xlsx")
    ).toBe(true);
  });

  it("detecta spreadsheetml por MIME", () => {
    expect(
      isSpreadsheetAttachment(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "archivo.bin"
      )
    ).toBe(true);
  });

  it("rechaza .xls binario legacy", () => {
    expect(isSpreadsheetAttachment("application/vnd.ms-excel", "viejo.xls")).toBe(
      false
    );
  });

  it("no marca pdf/docx como spreadsheet", () => {
    expect(isSpreadsheetAttachment("application/pdf", "a.pdf")).toBe(false);
    expect(
      isSpreadsheetAttachment(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx"
      )
    ).toBe(false);
  });
});

describe("cellValueToDisplay", () => {
  it("stringifya primitivos y fechas", () => {
    expect(cellValueToDisplay(null)).toBe("");
    expect(cellValueToDisplay(42)).toBe("42");
    expect(cellValueToDisplay("hola")).toBe("hola");
    expect(cellValueToDisplay({ result: 10, formula: "A1+1" })).toBe("10");
    expect(cellValueToDisplay({ text: "link", hyperlink: "https://x" })).toBe(
      "link"
    );
    expect(
      cellValueToDisplay({ richText: [{ text: "A" }, { text: "B" }] })
    ).toBe("AB");
  });
});

describe("parseXlsxPreview", () => {
  it("lee hojas y celdas de un xlsx real", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Detalle");
    ws.addRow(["Guardia", "Horas", "Total"]);
    ws.addRow(["Ana", 8, 100]);
    ws.addRow(["Luis", 12, 150]);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const preview = await parseXlsxPreview(buf);
    expect(preview.sheets).toHaveLength(1);
    expect(preview.sheets[0].name).toBe("Detalle");
    expect(preview.sheets[0].rows[0]).toEqual(["Guardia", "Horas", "Total"]);
    expect(preview.sheets[0].rows[1]).toEqual(["Ana", "8", "100"]);
    expect(preview.sheets[0].rows[2]).toEqual(["Luis", "12", "150"]);
  });

  it("expone múltiples hojas", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Uno").addRow(["a"]);
    wb.addWorksheet("Dos").addRow(["b"]);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const preview = await parseXlsxPreview(buf);
    expect(preview.sheets.map((s) => s.name)).toEqual(["Uno", "Dos"]);
  });
});
