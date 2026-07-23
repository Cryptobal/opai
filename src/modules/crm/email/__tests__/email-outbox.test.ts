import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailOutbox: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/storage", () => ({ deleteFile: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../gmail-send.service", () => ({ performGmailSend: vi.fn() }));
vi.mock("../email-observability", () => ({ captureEmailError: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { performGmailSend } from "../gmail-send.service";
import {
  EMAIL_OUTBOX_MAX_ATTEMPTS,
  dispatchOutboxItem,
  dueOutboxWhere,
  emailUndoWindowMs,
  enqueueOutboxSend,
  outboxBackoffMs,
} from "../email-outbox";
import { appendSignatureOnce, SIGNATURE_MARKER_ATTR } from "../email-signature";

const mockedPrisma = vi.mocked(prisma, true);
const mockedSend = vi.mocked(performGmailSend);

const basePayload = {
  to: ["a@b.cl"],
  cc: [],
  bcc: [],
  subject: "Hola",
  html: "<p>hola</p>",
  text: null,
  threadId: null,
  dealId: null,
  accountId: null,
  contactId: null,
  attachments: [],
  userEmail: "u@t.cl",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("emailUndoWindowMs", () => {
  it("default 15s, configurable por env", () => {
    delete process.env.EMAIL_UNDO_WINDOW_SECONDS;
    expect(emailUndoWindowMs()).toBe(15_000);
    process.env.EMAIL_UNDO_WINDOW_SECONDS = "30";
    expect(emailUndoWindowMs()).toBe(30_000);
    process.env.EMAIL_UNDO_WINDOW_SECONDS = "abc";
    expect(emailUndoWindowMs()).toBe(15_000);
    delete process.env.EMAIL_UNDO_WINDOW_SECONDS;
  });
});

describe("outboxBackoffMs", () => {
  it("backoff exponencial con cap de 30 minutos", () => {
    expect(outboxBackoffMs(1)).toBe(30_000);
    expect(outboxBackoffMs(2)).toBe(120_000);
    expect(outboxBackoffMs(3)).toBe(480_000);
    expect(outboxBackoffMs(10)).toBe(30 * 60_000);
  });
});

describe("dueOutboxWhere", () => {
  it("solo queued/held con undo, programación y backoff vencidos (null-safe)", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const where = dueOutboxWhere(now);
    expect(where.status).toEqual({ in: ["queued", "held"] });
    expect(where.AND).toEqual([
      { OR: [{ undoUntil: null }, { undoUntil: { lte: now } }] },
      { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
      { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    ]);
  });
});

describe("appendSignatureOnce (R2 — firma idempotente)", () => {
  it("agrega la firma con marcador cuando no está", () => {
    const result = appendSignatureOnce("<p>hola</p>", "<p>Firma</p>");
    expect(result.appended).toBe(true);
    expect(result.html).toContain(SIGNATURE_MARKER_ATTR);
    expect(result.html).toContain("<p>Firma</p>");
  });

  it("NO duplica si el HTML ya tiene el marcador", () => {
    const first = appendSignatureOnce("<p>hola</p>", "<p>Firma</p>");
    const second = appendSignatureOnce(first.html, "<p>Firma</p>");
    expect(second.appended).toBe(false);
    expect(second.html).toBe(first.html);
  });

  it("NO duplica si la firma ya está pegada cruda (composer legacy)", () => {
    const html = "<p>hola</p><p>Firma   corporativa</p>";
    const result = appendSignatureOnce(html, "<p>Firma corporativa</p>");
    expect(result.appended).toBe(false);
    expect(result.html).toBe(html);
  });

  it("firma vacía o nula no toca el HTML", () => {
    expect(appendSignatureOnce("<p>hola</p>", null).html).toBe("<p>hola</p>");
    expect(appendSignatureOnce("<p>hola</p>", "  ").html).toBe("<p>hola</p>");
  });
});

describe("enqueueOutboxSend (idempotencia)", () => {
  const params = {
    tenantId: "t1",
    userId: "u1",
    emailAccountId: "acc-1",
    idempotencyKey: "key-1",
    payload: basePayload,
  };

  it("crea el item con undo_until al encolar inmediato", async () => {
    const created = { id: "o1", tenantId: "t1", status: "queued" };
    mockedPrisma.crmEmailOutbox.create.mockResolvedValue(created as never);
    const result = await enqueueOutboxSend(params);
    expect(result.created).toBe(true);
    const data = mockedPrisma.crmEmailOutbox.create.mock.calls[0][0].data;
    expect(data.status).toBe("queued");
    expect(data.undoUntil).toBeInstanceOf(Date);
    expect(data.scheduledAt).toBeNull();
  });

  it("programado encola como held sin ventana de deshacer", async () => {
    mockedPrisma.crmEmailOutbox.create.mockResolvedValue({ id: "o2" } as never);
    const scheduledAt = new Date(Date.now() + 3_600_000);
    await enqueueOutboxSend({ ...params, scheduledAt });
    const data = mockedPrisma.crmEmailOutbox.create.mock.calls[0][0].data;
    expect(data.status).toBe("held");
    expect(data.scheduledAt).toBe(scheduledAt);
    expect(data.undoUntil).toBeNull();
  });

  it("carrera/reintento con la misma key devuelve el item existente (1 solo correo)", async () => {
    mockedPrisma.crmEmailOutbox.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const existing = { id: "o1", tenantId: "t1", status: "queued" };
    mockedPrisma.crmEmailOutbox.findUnique.mockResolvedValue(existing as never);
    const result = await enqueueOutboxSend(params);
    expect(result.created).toBe(false);
    expect(result.item).toBe(existing);
  });

  it("una key de otro tenant no es reutilizable (no filtra datos)", async () => {
    mockedPrisma.crmEmailOutbox.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    mockedPrisma.crmEmailOutbox.findUnique.mockResolvedValue({
      id: "o1",
      tenantId: "OTRO",
    } as never);
    await expect(enqueueOutboxSend(params)).rejects.toThrow();
  });
});

describe("dispatchOutboxItem", () => {
  const item = {
    id: "o1",
    tenantId: "t1",
    userId: "u1",
    emailAccountId: "acc-1",
    attempts: 1,
    payload: basePayload,
  };

  it("claim perdido (cancelado o ya reclamado) → skipped, sin envío", async () => {
    mockedPrisma.crmEmailOutbox.updateMany.mockResolvedValue({ count: 0 });
    const result = await dispatchOutboxItem("o1");
    expect(result).toBe("skipped");
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("envío exitoso marca sent con ids del proveedor", async () => {
    mockedPrisma.crmEmailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.crmEmailOutbox.findUnique.mockResolvedValue(item as never);
    mockedSend.mockResolvedValue({
      ok: true,
      threadId: "th1",
      messageId: "m1",
      providerMessageId: "pm1",
      reconciled: false,
    });
    const result = await dispatchOutboxItem("o1");
    expect(result).toBe("sent");
    const update = mockedPrisma.crmEmailOutbox.update.mock.calls[0][0];
    expect(update.data).toMatchObject({
      status: "sent",
      providerMessageId: "pm1",
      messageId: "m1",
    });
  });

  it("fallo reintentable re-encola con backoff", async () => {
    mockedPrisma.crmEmailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.crmEmailOutbox.findUnique.mockResolvedValue(item as never);
    mockedSend.mockResolvedValue({
      ok: false,
      status: 502,
      error: "boom",
      retryable: true,
    });
    const result = await dispatchOutboxItem("o1");
    expect(result).toBe("retry");
    const update = mockedPrisma.crmEmailOutbox.update.mock.calls[0][0];
    expect(update.data.status).toBe("queued");
    expect(update.data.nextAttemptAt).toBeInstanceOf(Date);
    expect(update.data.lastError).toBe("boom");
  });

  it("fallo definitivo (no reintentable) marca failed visible", async () => {
    mockedPrisma.crmEmailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.crmEmailOutbox.findUnique.mockResolvedValue(item as never);
    mockedSend.mockResolvedValue({
      ok: false,
      status: 403,
      error: "permisos",
      retryable: false,
    });
    const result = await dispatchOutboxItem("o1");
    expect(result).toBe("failed");
    expect(mockedPrisma.crmEmailOutbox.update.mock.calls[0][0].data.status).toBe(
      "failed",
    );
  });

  it("agotados los intentos marca failed aunque sea reintentable", async () => {
    mockedPrisma.crmEmailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.crmEmailOutbox.findUnique.mockResolvedValue({
      ...item,
      attempts: EMAIL_OUTBOX_MAX_ATTEMPTS,
    } as never);
    mockedSend.mockResolvedValue({
      ok: false,
      status: 502,
      error: "boom",
      retryable: true,
    });
    const result = await dispatchOutboxItem("o1");
    expect(result).toBe("failed");
  });
});
