/**
 * Upsert idempotente de mensajes Gmail (S15): mismo mensaje dos veces = una
 * sola fila (carrera P2002 incluida), drafts excluidos del sync normal (C08)
 * y prefetch del batch (S11) sin get individual.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  msgFindUnique: vi.fn(),
  msgFindFirst: vi.fn(),
  msgCreate: vi.fn(),
  msgUpdate: vi.fn(),
  threadUpdate: vi.fn(),
  threadUpdateMany: vi.fn(),
  upsertLinkedThread: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailMessage: {
      findUnique: mocks.msgFindUnique,
      findFirst: mocks.msgFindFirst,
      create: mocks.msgCreate,
      update: mocks.msgUpdate,
      count: vi.fn().mockResolvedValue(0),
    },
    crmEmailThread: {
      update: mocks.threadUpdate,
      updateMany: mocks.threadUpdateMany,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));
vi.mock("../thread-linking", () => ({ upsertLinkedThread: mocks.upsertLinkedThread }));

import { Prisma } from "@prisma/client";
import { upsertGmailMessage } from "../gmail-message-upsert";
import { collectHistoryPage } from "../gmail-incremental-page";

const emailAccount = { id: "acc-1", email: "yo@gard.cl", userId: "user-1" };

function gmailMessage(overrides?: Partial<{ labelIds: string[] }>) {
  return {
    id: "msg-1",
    threadId: "th-1",
    labelIds: overrides?.labelIds ?? ["INBOX", "UNREAD"],
    snippet: "hola",
    payload: {
      headers: [
        { name: "Subject", value: "Cotización" },
        { name: "From", value: "Cliente <cliente@acme.com>" },
        { name: "To", value: "yo@gard.cl" },
        { name: "Date", value: "Tue, 21 Jul 2026 10:00:00 -0400" },
      ],
    },
  };
}

function fakeGmail(message = gmailMessage()) {
  return {
    users: { messages: { get: vi.fn().mockResolvedValue({ data: message }) } },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.msgFindUnique.mockResolvedValue(null);
  mocks.msgFindFirst.mockResolvedValue(null);
  mocks.upsertLinkedThread.mockResolvedValue({ id: "local-th-1" });
  mocks.msgCreate.mockResolvedValue({ id: "row-1" });
  mocks.msgUpdate.mockResolvedValue({ id: "row-1" });
});

describe("upsertGmailMessage", () => {
  it("mensaje nuevo crea fila y hilo vinculado", async () => {
    const result = await upsertGmailMessage({
      gmail: fakeGmail(),
      tenantId: "t1",
      emailAccount,
      messageId: "msg-1",
    });
    expect(result.wrote).toBe(true);
    expect(mocks.msgCreate).toHaveBeenCalledTimes(1);
    const data = mocks.msgCreate.mock.calls[0][0].data;
    expect(data.providerMessageId).toBe("msg-1");
    expect(data.tenantId).toBe("t1");
    // Conserva display name del From (bandeja muestra "Cliente", no solo email).
    expect(data.fromEmail).toBe("Cliente <cliente@acme.com>");
  });

  it("carrera P2002 en create degrada a update (idempotente, 1 sola fila)", async () => {
    mocks.msgCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const result = await upsertGmailMessage({
      gmail: fakeGmail(),
      tenantId: "t1",
      emailAccount,
      messageId: "msg-1",
    });
    expect(result.wrote).toBe(false);
    expect(mocks.msgUpdate).toHaveBeenCalledTimes(1);
  });

  it("mensaje ya existente con cuerpo solo refresca labels (no reescribe)", async () => {
    mocks.msgFindUnique.mockResolvedValue({
      id: "row-1",
      threadId: "local-th-1",
      htmlBody: "<p>ya está</p>",
      textBody: null,
    });
    const result = await upsertGmailMessage({
      gmail: fakeGmail(),
      tenantId: "t1",
      emailAccount,
      messageId: "msg-1",
    });
    expect(result.wrote).toBe(false);
    expect(mocks.msgCreate).not.toHaveBeenCalled();
    expect(mocks.msgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { labelIds: ["INBOX", "UNREAD"] } }),
    );
  });

  it("mensajes DRAFT se saltan (los maneja el espejo de borradores, C08)", async () => {
    const result = await upsertGmailMessage({
      gmail: fakeGmail(gmailMessage({ labelIds: ["DRAFT"] })),
      tenantId: "t1",
      emailAccount,
      messageId: "msg-1",
    });
    expect(result.wrote).toBe(false);
    expect(mocks.msgCreate).not.toHaveBeenCalled();
    expect(mocks.msgUpdate).not.toHaveBeenCalled();
  });

  it("prefetched del batch evita el get individual (S11)", async () => {
    const gmail = fakeGmail();
    await upsertGmailMessage({
      gmail,
      tenantId: "t1",
      emailAccount,
      messageId: "msg-1",
      prefetched: gmailMessage() as never,
    });
    expect(
      (gmail as { users: { messages: { get: ReturnType<typeof vi.fn> } } }).users.messages.get,
    ).not.toHaveBeenCalled();
    expect(mocks.msgCreate).toHaveBeenCalledTimes(1);
  });
});

describe("collectHistoryPage (paginación de history, S15)", () => {
  it("acumula messagesAdded, hilos con labels tocados y el mayor historyId", () => {
    const page = collectHistoryPage([
      { id: "100", messagesAdded: [{ message: { id: "m1" } }] },
      {
        id: "101",
        labelsAdded: [{ message: { threadId: "t1" } }],
        labelsRemoved: [{ message: { threadId: "t2" } }],
      },
      { id: "102", messagesDeleted: [{ message: { threadId: "t3" } }] },
    ] as never);
    expect(Array.from(page.ids)).toEqual(["m1"]);
    expect(Array.from(page.labelThreadIds).sort()).toEqual(["t1", "t2", "t3"]);
    expect(page.maxHistoryRecordId).toBe("102");
  });
});
