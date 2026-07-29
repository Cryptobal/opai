/**
 * count_emails: aislamiento tenant/casilla y solo rama léxica.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  semanticSearchChunks: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailAccount: { findFirst: mocks.accountFindFirst },
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/modules/crm/email/email-embeddings", () => ({
  semanticSearchChunks: mocks.semanticSearchChunks,
  emailEmbeddingsDisabled: () => true,
  rankThreadsFromHits: () => [],
}));

import { toolCountEmails } from "../help-chat-email-search-tools";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountFindFirst.mockResolvedValue({
    id: "00000000-0000-0000-0000-0000000000aa",
  });
  mocks.queryRaw.mockResolvedValue([{ total: 7n }]);
});

describe("toolCountEmails", () => {
  it("filtra por tenantId y emailAccountId de la casilla del usuario", async () => {
    const result = (await toolCountEmails("tenant-a", "user-1", {
      query: "macronet",
      folder: "all",
    })) as { ok: boolean; total: number };

    expect(result.ok).toBe(true);
    expect(result.total).toBe(7);
    expect(mocks.accountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          userId: "user-1",
          provider: "gmail",
          status: "active",
        }),
      }),
    );
    const sql = mocks.queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("t.tenant_id");
    expect(sql.sql).toContain("t.email_account_id");
    expect(sql.values).toContain("tenant-a");
    expect(sql.values).toContain("00000000-0000-0000-0000-0000000000aa");
    expect(mocks.semanticSearchChunks).not.toHaveBeenCalled();
  });

  it("sin casilla activa no consulta el universo", async () => {
    mocks.accountFindFirst.mockResolvedValue(null);
    const result = (await toolCountEmails("tenant-a", "user-1", {
      query: "x",
    })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("groupBy=domain agrega sin devolver asuntos", async () => {
    mocks.queryRaw.mockResolvedValue([
      { key: "macronet.cl", total: 3n },
      { key: "otro.cl", total: 1n },
    ]);
    const result = (await toolCountEmails("tenant-a", "user-1", {
      query: "",
      newerThan: "30d",
      groupBy: "domain",
    })) as {
      ok: boolean;
      total: number;
      groups: Array<{ key: string; count: number }>;
    };
    expect(result.ok).toBe(true);
    expect(result.total).toBe(4);
    expect(result.groups).toEqual([
      { key: "macronet.cl", count: 3 },
      { key: "otro.cl", count: 1 },
    ]);
    const sql = mocks.queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql.toLowerCase()).toContain("split_part");
    expect(sql.sql.toLowerCase()).not.toContain("subject");
    expect(mocks.semanticSearchChunks).not.toHaveBeenCalled();
  });
});
