/**
 * Tests de guardado en lote de adjuntos (B5): normalización del body legacy a
 * items[] y deduplicación por contentHash (reutiliza el objeto R2, crea solo el
 * link faltante).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fileFindFirst: vi.fn(),
  fileCreate: vi.fn(),
  linkFindFirst: vi.fn(),
  linkCreate: vi.fn(),
  fetchGmailAttachment: vi.fn(),
  uploadFile: vi.fn(),
  enqueueCrmFileToDrive: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmFile: { findFirst: mocks.fileFindFirst, create: mocks.fileCreate },
    crmFileLink: { findFirst: mocks.linkFindFirst, create: mocks.linkCreate },
  },
}));
vi.mock("@/lib/storage", () => ({
  uploadFile: mocks.uploadFile,
  STORAGE_PROVIDER: "r2",
}));
vi.mock("@/lib/google-workspace/drive-enqueue-hooks", () => ({
  enqueueCrmFileToDrive: mocks.enqueueCrmFileToDrive,
}));
vi.mock("../gmail-attachment", () => ({
  fetchGmailAttachment: mocks.fetchGmailAttachment,
}));

import { normalizeSaveItems, saveThreadAttachments } from "../save-attachments";

describe("normalizeSaveItems", () => {
  it("normaliza el body legacy de un solo adjunto a items[1]", () => {
    const items = normalizeSaveItems({ messageId: "m1", attachmentId: "a1", filename: "x.pdf", size: 10 });
    expect(items).toEqual([{ messageId: "m1", attachmentId: "a1", filename: "x.pdf", size: 10 }]);
  });

  it("acepta items[] y descarta entradas inválidas", () => {
    const items = normalizeSaveItems({
      items: [
        { messageId: "m1", attachmentId: "a1", filename: "a.pdf", size: 1 },
        { messageId: "m2" }, // inválida (sin attachmentId)
        { attachmentId: "a3" }, // inválida (sin messageId)
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].messageId).toBe("m1");
  });

  it("body vacío → []", () => {
    expect(normalizeSaveItems({})).toEqual([]);
  });
});

describe("saveThreadAttachments — dedupe por contentHash", () => {
  const base = {
    tenantId: "t1",
    userId: "u1",
    threadId: "thr-1",
    entityType: "account" as const,
    entityId: "acc-1",
    folderId: null,
    portalVisible: false,
    enqueueDrive: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchGmailAttachment.mockResolvedValue({
      ok: true,
      buffer: Buffer.from("PDFDATA"),
      filename: "doc.pdf",
      mimeType: "application/pdf",
      size: 7,
    });
    mocks.uploadFile.mockResolvedValue({
      storageKey: "t1/crm/2026/07/uuid.pdf",
      fileName: "doc.pdf",
      mimeType: "application/pdf",
      size: 7,
    });
    mocks.fileCreate.mockResolvedValue({
      id: "file-new",
      storageKey: "t1/crm/2026/07/uuid.pdf",
      fileName: "doc.pdf",
      mimeType: "application/pdf",
    });
    mocks.linkCreate.mockResolvedValue({ id: "link-1" });
  });

  it("archivo nuevo: sube a R2, crea CrmFile con procedencia+hash y link", async () => {
    mocks.fileFindFirst.mockResolvedValue(null);
    mocks.linkFindFirst.mockResolvedValue(null);

    const res = await saveThreadAttachments({ ...base, items: [{ messageId: "m1", attachmentId: "a1" }] });

    expect(res).toEqual([{ filename: "doc.pdf", status: "saved", fileId: "file-new" }]);
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    const created = mocks.fileCreate.mock.calls[0][0].data;
    expect(created.sourceType).toBe("email");
    expect(created.sourceThreadId).toBe("thr-1");
    expect(created.sourceMessageId).toBe("m1");
    expect(created.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("binario ya existente en el tenant: reutiliza el objeto, no re-sube, crea el link faltante", async () => {
    mocks.fileFindFirst.mockResolvedValue({
      id: "file-existing",
      storageKey: "k",
      fileName: "doc.pdf",
      mimeType: "application/pdf",
    });
    mocks.linkFindFirst.mockResolvedValue(null);

    const res = await saveThreadAttachments({ ...base, items: [{ messageId: "m1", attachmentId: "a1" }] });

    expect(res[0]).toEqual({ filename: "doc.pdf", status: "saved", fileId: "file-existing" });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(mocks.fileCreate).not.toHaveBeenCalled();
    expect(mocks.linkCreate).toHaveBeenCalledWith({
      data: { tenantId: "t1", fileId: "file-existing", entityType: "account", entityId: "acc-1", folderId: null },
    });
  });

  it("objeto y link ya existentes: status already, no crea link", async () => {
    mocks.fileFindFirst.mockResolvedValue({ id: "file-existing", storageKey: "k", fileName: "doc.pdf", mimeType: "application/pdf" });
    mocks.linkFindFirst.mockResolvedValue({ id: "link-existing" });

    const res = await saveThreadAttachments({ ...base, items: [{ messageId: "m1", attachmentId: "a1" }] });

    expect(res[0].status).toBe("already");
    expect(mocks.linkCreate).not.toHaveBeenCalled();
  });

  it("adjunto que falla al bajar: status error, no aborta el lote", async () => {
    mocks.fileFindFirst.mockResolvedValue(null);
    mocks.linkFindFirst.mockResolvedValue(null);
    mocks.fetchGmailAttachment
      .mockResolvedValueOnce({ ok: false, status: 404, error: "Adjunto no encontrado" })
      .mockResolvedValueOnce({ ok: true, buffer: Buffer.from("X"), filename: "ok.pdf", mimeType: "application/pdf", size: 1 });

    const res = await saveThreadAttachments({
      ...base,
      items: [
        { messageId: "m1", attachmentId: "bad" },
        { messageId: "m2", attachmentId: "good" },
      ],
    });

    expect(res[0]).toMatchObject({ status: "error", error: "Adjunto no encontrado" });
    expect(res[1].status).toBe("saved");
  });
});
