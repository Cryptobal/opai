import { isSpreadsheetAttachment } from "./xlsx-attachment-preview";

export type AttachmentPreviewKind =
  | "pdf"
  | "image"
  | "text"
  | "docx"
  | "xlsx"
  | "other";

/**
 * Clasifica el adjunto por MIME/extensión para la vista previa.
 * HTML/XML/SVG nunca se renderizan inline (riesgo XSS).
 *
 * Los MIME OOXML (Word/Excel) contienen la subcadena "xml"
 * (`openxmlformats…`); por eso Excel y Word se resuelven ANTES
 * del bloque XSS — si no, .docx/.xlsx caen en "other".
 */
export function classifyAttachment(
  mimeType: string,
  filename: string
): AttachmentPreviewKind {
  const mt = (mimeType || "").toLowerCase();
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (isSpreadsheetAttachment(mimeType, filename)) return "xlsx";

  if (
    mt.includes("wordprocessingml") ||
    mt === "application/msword" ||
    ext === "docx"
  ) {
    // .doc (binario legacy) no lo convierte mammoth; solo docx/OOXML.
    if (ext === "doc" && !mt.includes("wordprocessingml")) return "other";
    return "docx";
  }

  if (
    mt.includes("html") ||
    mt.includes("xml") ||
    mt.includes("svg") ||
    ["html", "htm", "xml", "svg"].includes(ext)
  ) {
    return "other";
  }

  if (mt.includes("pdf") || ext === "pdf") return "pdf";
  if (mt.startsWith("image/")) return "image";
  if (
    mt.startsWith("text/") ||
    mt === "application/json" ||
    ["txt", "csv", "md", "log", "json"].includes(ext)
  ) {
    return "text";
  }
  return "other";
}
