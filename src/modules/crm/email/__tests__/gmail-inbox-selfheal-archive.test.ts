import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  updateMany: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
    crmEmailThread: { updateMany: mocks.updateMany },
  },
}));

vi.mock("../correos-folder-counts", () => ({
  invalidateCorreoFolderCounts: mocks.invalidate,
}));

import { archiveThreadsWithoutInboxLabel } from "../gmail-inbox-selfheal";

function sqlText(arg: unknown): string {
  if (arg instanceof Prisma.Sql) return arg.sql;
  if (Array.isArray(arg) && typeof arg[0] === "string") {
    // Tagged template form: prisma.$queryRaw`...` passes strings + values
    return String(arg[0]);
  }
  // Prisma tagged template via $queryRaw calls with Prisma.Sql internally
  return String((arg as { sql?: string })?.sql ?? arg);
}

describe("archiveThreadsWithoutInboxLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa SELECT+JOIN LATERAL (no UPDATE…FROM LATERAL → 42P10)", async () => {
    mocks.queryRaw.mockResolvedValue([{ id: "th-1" }, { id: "th-2" }]);
    mocks.updateMany.mockResolvedValue({ count: 2 });
    mocks.executeRaw.mockResolvedValue(2);

    const n = await archiveThreadsWithoutInboxLabel({
      tenantId: "tenant",
      emailAccountId: "11111111-1111-1111-1111-111111111111",
    });

    expect(n).toBe(2);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    const rawArg = mocks.queryRaw.mock.calls[0][0];
    // prisma.$queryRaw`...` → first arg is template strings array when mocked,
    // or Prisma.Sql depending on how vitest intercepts. Join all string chunks.
    const text = Array.isArray(rawArg)
      ? rawArg.join(" ")
      : sqlText(rawArg);
    expect(text).toMatch(/SELECT\s+t\.id/i);
    expect(text).toMatch(/INNER JOIN LATERAL/i);
    expect(text).not.toMatch(/UPDATE\s+crm\.email_threads/i);
    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(mocks.updateMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["th-1", "th-2"] },
          archivedAt: null,
        }),
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );
  });

  it("no muta si no hay candidatos", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const n = await archiveThreadsWithoutInboxLabel({
      tenantId: "tenant",
      emailAccountId: "11111111-1111-1111-1111-111111111111",
    });
    expect(n).toBe(0);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
