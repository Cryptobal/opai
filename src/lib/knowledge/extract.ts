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

  throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
}
