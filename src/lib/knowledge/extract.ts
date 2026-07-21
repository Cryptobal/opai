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
    // unpdf: build serverless de pdf.js SIN canvas/DOM — funciona en Vercel.
    // pdf-parse quedó descartado: su dep nativa @napi-rs/canvas no llega a la
    // lambda (el file tracer no sigue su require dinámico) y el import lanza
    // "ReferenceError: DOMMatrix is not defined" en producción.
    const { extractText: unpdfExtract, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await unpdfExtract(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
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
