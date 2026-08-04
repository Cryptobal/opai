import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqQuoteTrash: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/cpq/document-counter", () => ({
  nextDocumentCode: vi.fn(),
}));

vi.mock("@/lib/crm-history", () => ({
  createCrmHistoryLog: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  deleteFile: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { restoreQuoteFromTrash, serializeForTrash } from "../quote-trash.service";

describe("quote trash service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializeForTrash convierte Decimal y Date sin pasar por Number", () => {
    const date = new Date("2026-12-05T01:00:00.000Z");
    const serialized = serializeForTrash({
      amount: new Prisma.Decimal("123456789012345.67"),
      nested: [{ at: date }],
    });

    expect(serialized).toEqual({
      amount: "123456789012345.67",
      nested: [{ at: "2026-12-05T01:00:00.000Z" }],
    });
  });

  it("restoreQuoteFromTrash rechaza papelera ya restaurada", async () => {
    vi.mocked(prisma.cpqQuoteTrash.findFirst).mockResolvedValue({
      id: "trash-1",
      tenantId: "tenant-1",
      quoteId: "quote-1",
      code: "CPQ-2026-001",
      payload: {},
      restoredAt: new Date("2026-12-05T02:00:00.000Z"),
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    } as never);

    await expect(
      restoreQuoteFromTrash({ tenantId: "tenant-1", trashId: "trash-1", userId: "user-1" }),
    ).rejects.toMatchObject({ code: "ALREADY_RESTORED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("restoreQuoteFromTrash rechaza papelera expirada", async () => {
    vi.mocked(prisma.cpqQuoteTrash.findFirst).mockResolvedValue({
      id: "trash-2",
      tenantId: "tenant-1",
      quoteId: "quote-2",
      code: "CPQ-2026-002",
      payload: {},
      restoredAt: null,
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    } as never);

    await expect(
      restoreQuoteFromTrash({ tenantId: "tenant-1", trashId: "trash-2", userId: "user-1" }),
    ).rejects.toMatchObject({ code: "EXPIRED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
