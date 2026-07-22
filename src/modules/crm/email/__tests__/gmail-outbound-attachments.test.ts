import { describe, expect, it } from "vitest";
import {
  emailAttachmentPrefix,
  isBlockedEmailAttachment,
  isOwnedEmailAttachmentKey,
  sanitizeEmailAttachmentName,
} from "../gmail-outbound-attachments";

describe("gmail outbound attachments", () => {
  it("acepta documentos comunes y bloquea ejecutables", () => {
    expect(isBlockedEmailAttachment("propuesta.pdf", "application/pdf")).toBe(
      false,
    );
    expect(
      isBlockedEmailAttachment("factura.exe", "application/octet-stream"),
    ).toBe(true);
    expect(
      isBlockedEmailAttachment("script.txt", "application/x-sh"),
    ).toBe(true);
    expect(
      isBlockedEmailAttachment("instalador.msixbundle", "application/zip"),
    ).toBe(true);
    expect(
      isBlockedEmailAttachment("plugin.xll. ", "application/octet-stream"),
    ).toBe(true);
  });

  it("aísla keys por tenant y usuario", () => {
    const owned = `${emailAttachmentPrefix("tenant-a", "user-a")}2026/07/file.pdf`;
    expect(
      isOwnedEmailAttachmentKey({
        storageKey: owned,
        tenantId: "tenant-a",
        userId: "user-a",
      }),
    ).toBe(true);
    expect(
      isOwnedEmailAttachmentKey({
        storageKey: owned,
        tenantId: "tenant-b",
        userId: "user-a",
      }),
    ).toBe(false);
    expect(
      isOwnedEmailAttachmentKey({
        storageKey: `${emailAttachmentPrefix("tenant-a", "user-a")}../secret`,
        tenantId: "tenant-a",
        userId: "user-a",
      }),
    ).toBe(false);
  });

  it("sanea nombres para headers y storage", () => {
    expect(sanitizeEmailAttachmentName('../"cotización"\n.pdf')).toBe(
      "..__cotización__.pdf",
    );
  });
});
