/**
 * Extrae texto de un archivo según su tipo MIME.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === 'text/markdown' || mimeType === 'text/plain') {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const out: string[] = [];
    wb.eachSheet((ws) => {
      out.push(`=== Hoja: ${ws.name} ===`);
      ws.eachRow((row, rowNumber) => {
        const vals = (row.values as unknown[])
          .slice(1)
          .map((v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)));
        if (vals.some((v) => v.trim() !== "")) out.push(`${rowNumber}: ${vals.join(" | ")}`);
      });
    });
    return out.join("\n");
  }
  if (mimeType === "text/csv") {
    return buffer.toString("utf-8");
  }
  throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
}
