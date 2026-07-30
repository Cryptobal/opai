import { describe, expect, it } from "vitest";
import {
  allAttachmentsForMessage,
  attachmentsForMessage,
  isListedAttachment,
} from "../correo-attachments-scope";
import type { CorreoAttachmentDTO, CorreoMessageDTO } from "@/modules/crm/email/correos.types";

const msg = (partial: Partial<CorreoMessageDTO> & { id: string }): CorreoMessageDTO => ({
  id: partial.id,
  providerMessageId: partial.providerMessageId ?? null,
  direction: partial.direction ?? "in",
  fromEmail: partial.fromEmail ?? "a@b.cl",
  toEmails: partial.toEmails ?? [],
  ccEmails: partial.ccEmails ?? [],
  subject: partial.subject ?? "s",
  htmlBody: partial.htmlBody ?? null,
  textBody: partial.textBody ?? null,
  sentAt: partial.sentAt ?? null,
});

const att = (partial: Partial<CorreoAttachmentDTO> & { messageId: string; attachmentId: string }): CorreoAttachmentDTO => ({
  messageId: partial.messageId,
  attachmentId: partial.attachmentId,
  filename: partial.filename ?? "f.pdf",
  mimeType: partial.mimeType ?? "application/pdf",
  size: partial.size ?? 10,
  contentId: partial.contentId ?? null,
});

describe("isListedAttachment", () => {
  it("oculta imágenes inline con Content-ID", () => {
    expect(
      isListedAttachment(
        att({
          messageId: "m1",
          attachmentId: "a1",
          filename: "image001.jpg",
          mimeType: "image/jpeg",
          contentId: "image001.jpg@01D",
        }),
      ),
    ).toBe(false);
  });

  it("mantiene PDFs y archivos reales", () => {
    expect(isListedAttachment(att({ messageId: "m1", attachmentId: "a1" }))).toBe(true);
  });
});

describe("attachmentsForMessage", () => {
  it("asocia por providerMessageId (id Gmail)", () => {
    const m = msg({ id: "db-1", providerMessageId: "gmail-9" });
    const all = [
      att({ messageId: "gmail-9", attachmentId: "a1", filename: "os.pdf" }),
      att({ messageId: "gmail-other", attachmentId: "a2", filename: "otro.pdf" }),
    ];
    expect(attachmentsForMessage(all, m).map((a) => a.filename)).toEqual(["os.pdf"]);
  });

  it("también matchea por id local del espejo", () => {
    const m = msg({ id: "db-1", providerMessageId: null });
    const all = [att({ messageId: "db-1", attachmentId: "a1" })];
    expect(attachmentsForMessage(all, m)).toHaveLength(1);
  });

  it("excluye imágenes inline con Content-ID del listado", () => {
    const m = msg({ id: "db-1", providerMessageId: "gmail-9" });
    const all = [
      att({
        messageId: "gmail-9",
        attachmentId: "img",
        filename: "image.png",
        mimeType: "image/png",
        contentId: "ii_abc",
      }),
      att({ messageId: "gmail-9", attachmentId: "pdf", filename: "os.pdf" }),
    ];
    expect(attachmentsForMessage(all, m).map((a) => a.filename)).toEqual(["os.pdf"]);
  });
});

describe("allAttachmentsForMessage", () => {
  it("incluye embeds cid para el rewrite del HTML del lector", () => {
    const m = msg({ id: "db-1", providerMessageId: "gmail-9" });
    const all = [
      att({
        messageId: "gmail-9",
        attachmentId: "img",
        filename: "image.png",
        mimeType: "image/png",
        contentId: "ii_abc",
      }),
      att({ messageId: "gmail-9", attachmentId: "pdf", filename: "os.pdf" }),
      att({ messageId: "gmail-other", attachmentId: "x", filename: "otro.pdf" }),
    ];
    expect(allAttachmentsForMessage(all, m).map((a) => a.filename)).toEqual([
      "image.png",
      "os.pdf",
    ]);
  });
});
