import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  embeddingsCreate: vi.fn(),
  queryRaw: vi.fn(),
  executeRawUnsafe: vi.fn(),
  chunkFindMany: vi.fn(),
  logAiUsage: vi.fn(),
  getTenantOpenAIClient: vi.fn(),
}));
vi.mock("@/lib/ai/tenant-openai", () => ({
  getTenantOpenAIClient: mocks.getTenantOpenAIClient,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $executeRawUnsafe: mocks.executeRawUnsafe,
    crmEmailChunk: { findMany: mocks.chunkFindMany },
  },
}));
vi.mock("@/lib/platform-ai-service", () => ({ logAiUsage: mocks.logAiUsage }));

import {
  messagePlainText,
  rankThreadsFromHits,
  semanticSearchChunks,
  splitEmailChunks,
} from "../email-embeddings";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.EMAIL_EMBEDDINGS_DISABLED;
  mocks.getTenantOpenAIClient.mockResolvedValue({
    embeddings: { create: mocks.embeddingsCreate },
  });
});

describe("messagePlainText", () => {
  it("prefiere textBody y limpia espacios", () => {
    expect(messagePlainText({ textBody: "  hola\n\nmundo ", htmlBody: null })).toBe("hola mundo");
  });
  it("cae a HTML sin tags ni estilos", () => {
    expect(
      messagePlainText({
        textBody: null,
        htmlBody: "<style>.x{color:red}</style><p>Hola <b>cliente</b>&nbsp;!</p>",
      }),
    ).toBe("Hola cliente !");
  });
});

describe("splitEmailChunks", () => {
  it("texto corto = un solo chunk; muy corto = ninguno", () => {
    expect(splitEmailChunks("Necesitamos cotizar 4 guardias para la bodega.")).toHaveLength(1);
    expect(splitEmailChunks("ok")).toHaveLength(0);
  });
  it("texto largo se parte con overlap", () => {
    const text = Array.from({ length: 120 }, (_, i) => `Oración número ${i} del correo largo.`).join(" ");
    const chunks = splitEmailChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1900);
  });
});

describe("rankThreadsFromHits", () => {
  it("rankea hilos por su mejor chunk (menor distancia)", () => {
    const ranked = rankThreadsFromHits(
      [
        { threadId: "b", messageId: "m", content: "", distance: 0.4 },
        { threadId: "a", messageId: "m", content: "", distance: 0.2 },
        { threadId: "b", messageId: "m", content: "", distance: 0.1 },
      ],
      5,
    );
    expect(ranked).toEqual(["b", "a"]);
  });
});

describe("semanticSearchChunks — aislamiento tenant (A07)", () => {
  it("el retrieval SIEMPRE filtra por tenant_id y email_account_id", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
      usage: { total_tokens: 8 },
    });
    mocks.queryRaw.mockResolvedValue([
      { thread_id: "t1", message_id: "m1", content: "hola", distance: 0.12 },
    ]);
    const hits = await semanticSearchChunks({
      tenantId: "tenant-1",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      query: "quién pidió más guardias",
    });
    const sql = mocks.queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("c.tenant_id =");
    expect(sql.sql).toContain("c.email_account_id =");
    expect(sql.values).toContain("tenant-1");
    expect(sql.values).toContain("00000000-0000-0000-0000-000000000001");
    expect(hits[0]).toMatchObject({ threadId: "t1", distance: 0.12 });
    expect(mocks.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "correo-semantic-query", tenantId: "tenant-1" }),
    );
  });

  it("aplica folderSql y structuralSql con JOIN a threads", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
      usage: { total_tokens: 4 },
    });
    mocks.queryRaw.mockResolvedValue([]);
    const folderSql = Prisma.sql`t.trashed_at IS NULL AND t.spam_at IS NULL`;
    const structuralSql = [Prisma.sql`t.attachment_count > 0`];
    await semanticSearchChunks({
      tenantId: "tenant-1",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      query: "factura",
      folderSql,
      structuralSql,
      limit: 10,
    });
    const sql = mocks.queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("JOIN crm.email_threads t");
    expect(sql.sql).toContain("t.trashed_at IS NULL");
    expect(sql.sql).toContain("t.attachment_count > 0");
  });

  it("sin OPENAI_API_KEY degrada a arreglo vacío", async () => {
    delete process.env.OPENAI_API_KEY;
    const hits = await semanticSearchChunks({
      tenantId: "t",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      query: "x",
    });
    expect(hits).toEqual([]);
    expect(mocks.embeddingsCreate).not.toHaveBeenCalled();
  });
});
