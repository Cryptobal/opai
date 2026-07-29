import { uploadFile } from "@/lib/storage";
import { extractText } from "@/lib/knowledge/extract";
import {
  DOC_ATTACHMENT_MAX_BYTES,
  DOC_TEXT_MAX_PER_FILE,
  DOC_TEXT_MAX_TOTAL,
  PDF_TEXT_MIN_CHARS,
  truncateDocText,
} from "@/lib/ai/document-text-budget";
import { listThreadAttachments } from "./gmail-account-client";
import type { StagedFile } from "./email-to-lead.types";
import type { gmail_v1 } from "googleapis";

const MAX_ATTACHMENTS = 6;
const MAX_SIZE = DOC_ATTACHMENT_MAX_BYTES;
const VISION_MIME = /^image\/(png|jpe?g)$/;
const TEXT_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

export type PdfForVision = {
  base64: string;
  mimeType: string;
  fileName: string;
};

export type PreparedAttachments = {
  stagedFiles: StagedFile[];
  docText: string;
  images: string[];
  imageMimes: string[];
  sources: string[];
  /** PDFs sin capa de texto útil; el caller puede enviarlos a visión. */
  pdfsForVision: PdfForVision[];
};

function fromB64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Baja adjuntos del hilo Gmail, los stagea en R2 y extrae texto / prepara visión. */
export async function prepareThreadAttachments(
  gmail: gmail_v1.Gmail,
  providerThreadId: string,
  tenantId: string,
): Promise<PreparedAttachments> {
  const out: PreparedAttachments = {
    stagedFiles: [],
    docText: "",
    images: [],
    imageMimes: [],
    sources: [],
    pdfsForVision: [],
  };
  const metas = (await listThreadAttachments(gmail, providerThreadId)).slice(0, MAX_ATTACHMENTS);
  let remainingBudget = DOC_TEXT_MAX_TOTAL;

  for (const meta of metas) {
    if (meta.size > MAX_SIZE) {
      out.sources.push(`${meta.filename} (omitido: ${Math.round(meta.size / 1024 / 1024)}MB)`);
      continue;
    }
    try {
      const res = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: meta.messageId,
        id: meta.attachmentId,
      });
      if (!res.data.data) continue;
      const buffer = fromB64Url(res.data.data);

      try {
        const up = await uploadFile(buffer, meta.filename, meta.mimeType, "chat-staged", tenantId);
        out.stagedFiles.push({
          storageKey: up.storageKey,
          fileName: meta.filename,
          mimeType: meta.mimeType,
          size: up.size,
        });
      } catch (e) {
        console.warn("[email-to-lead] staging falló", meta.filename, e);
      }

      if (VISION_MIME.test(meta.mimeType)) {
        out.images.push(buffer.toString("base64"));
        out.imageMimes.push(meta.mimeType);
        out.sources.push(`imagen ${meta.filename} (visión)`);
      } else if (TEXT_MIME.has(meta.mimeType)) {
        const text = await extractText(buffer, meta.mimeType).catch(() => "");
        const trimmed = text.trim();
        const isPdf = meta.mimeType === "application/pdf";

        if (isPdf && trimmed.length < PDF_TEXT_MIN_CHARS) {
          out.pdfsForVision.push({
            base64: buffer.toString("base64"),
            mimeType: meta.mimeType,
            fileName: meta.filename,
          });
          out.sources.push(
            `${meta.filename} (sin capa de texto, se usará visión)`,
          );
          if (trimmed) {
            // Conservar lo poco que haya si aún hay presupuesto.
            const perFile = Math.min(DOC_TEXT_MAX_PER_FILE, remainingBudget);
            if (perFile > 0) {
              const { text: sliced, truncated } = truncateDocText(trimmed, perFile, {
                label: meta.filename,
              });
              out.docText += `\n\n[Adjunto: ${meta.filename}]\n${sliced}`;
              remainingBudget -= Math.min(trimmed.length, perFile);
              if (truncated) {
                out.sources.push(`${meta.filename} (texto parcial + visión)`);
              }
            }
          }
        } else if (trimmed) {
          const perFile = Math.min(DOC_TEXT_MAX_PER_FILE, remainingBudget);
          if (perFile <= 0) {
            out.sources.push(
              `${meta.filename} (omitido: presupuesto de texto agotado; ${trimmed.length} chars)`,
            );
          } else {
            const { text: sliced, truncated } = truncateDocText(trimmed, perFile, {
              label: meta.filename,
            });
            out.docText += `\n\n[Adjunto: ${meta.filename}]\n${sliced}`;
            remainingBudget -= Math.min(trimmed.length, perFile);
            out.sources.push(
              truncated
                ? `${meta.filename} (texto truncado: ${trimmed.length} chars)`
                : `${meta.filename} (texto)`,
            );
          }
        } else {
          out.sources.push(`${meta.filename} (sin texto extraíble)`);
        }
      } else {
        out.sources.push(`${meta.filename} (omitido: ${meta.mimeType})`);
      }
    } catch (err) {
      console.warn("[email-to-lead] adjunto falló", meta.filename, err);
    }
  }
  return out;
}
