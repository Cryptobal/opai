import { afterEach, describe, expect, it, vi } from "vitest";
import { discardGmailDraft } from "../correo-discard-draft";
import { findThreadDraft } from "../CorreoReplyBox";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";

const msg = (
  partial: Partial<CorreoMessageDTO> & { id: string },
): CorreoMessageDTO => ({
  id: partial.id,
  providerMessageId: partial.providerMessageId ?? null,
  direction: partial.direction ?? "out",
  fromEmail: partial.fromEmail ?? "yo@gard.cl",
  toEmails: partial.toEmails ?? ["a@b.cl"],
  ccEmails: partial.ccEmails ?? [],
  subject: partial.subject ?? "s",
  htmlBody: partial.htmlBody ?? null,
  textBody: partial.textBody ?? "hola",
  sentAt: partial.sentAt ?? null,
  isDraft: partial.isDraft,
  providerDraftId: partial.providerDraftId,
});

describe("discardGmailDraft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETE al endpoint de drafts y retorna true si success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(discardGmailDraft("draft-123")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/crm/gmail/drafts/draft-123",
      { method: "DELETE" },
    );
  });

  it("retorna false si la API falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    await expect(discardGmailDraft("x")).resolves.toBe(false);
  });

  it("no llama fetch con id vacío", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(discardGmailDraft("  ")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("findThreadDraft", () => {
  it("devuelve el último borrador con providerDraftId", () => {
    const draft = findThreadDraft([
      msg({ id: "1", isDraft: false, sentAt: "2026-01-01T00:00:00.000Z" }),
      msg({ id: "2", isDraft: true, providerDraftId: "d1", textBody: "viejo" }),
      msg({ id: "3", isDraft: true, providerDraftId: "d2", textBody: "nuevo" }),
    ]);
    expect(draft?.id).toBe("3");
    expect(draft?.providerDraftId).toBe("d2");
  });

  it("ignora borradores sin providerDraftId", () => {
    expect(
      findThreadDraft([
        msg({ id: "1", isDraft: true, providerDraftId: null }),
      ]),
    ).toBeNull();
  });
});
