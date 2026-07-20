import { uploadFile } from "@/lib/storage";
import { extractText } from "@/lib/knowledge/extract";
import { listThreadAttachments } from "./gmail-account-client";
import type { StagedFile } from "./email-to-lead.types";
import type { gmail_v1 } from "googleapis";

const MAX_ATTACHMENTS = 6;
const MAX_SIZE = 6 * 1024 * 1024;
const VISION_MIME = /^image\/(png|jpe?g)$/;
const TEXT_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

export type PreparedAttachments = {
  stagedFiles: StagedFile[];
  docText: string;
  images: string[];
  imageMimes: string[];
  sources: string[];
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
  const out: PreparedAttachments = { stagedFiles: [], docText: "", images: [], imageMimes: [], sources: [] };
  const metas = (await listThreadAttachments(gmail, providerThreadId)).slice(0, MAX_ATTACHMENTS);

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
        out.stagedFiles.push({ storageKey: up.storageKey, fileName: meta.filename, mimeType: meta.mimeType, size: up.size });
      } catch (e) {
        console.warn("[email-to-lead] staging falló", meta.filename, e);
      }

      if (VISION_MIME.test(meta.mimeType)) {
        out.images.push(buffer.toString("base64"));
        out.imageMimes.push(meta.mimeType);
        out.sources.push(`imagen ${meta.filename} (visión)`);
      } else if (TEXT_MIME.has(meta.mimeType)) {
        const text = await extractText(buffer, meta.mimeType).catch(() => "");
        if (text.trim()) out.docText += `\n\n[Adjunto: ${meta.filename}]\n${text.slice(0, 6000)}`;
        out.sources.push(`${meta.filename} (texto)`);
      } else {
        out.sources.push(`${meta.filename} (omitido: ${meta.mimeType})`);
      }
    } catch (err) {
      console.warn("[email-to-lead] adjunto falló", meta.filename, err);
    }
  }
  return out;
}
