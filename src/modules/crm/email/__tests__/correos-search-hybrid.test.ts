import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  messageFindMany: vi.fn(async () => []),
  semanticSearchChunks: vi.fn(),
  emailEmbeddingsDisabled: vi.fn(() => false),
  rankThreadsFromHits: vi.fn(
    (hits: Array<{ threadId: string; distance: number }>, limit: number) => {
      const best = new Map<string, number>();
      for (const hit of hits) {
        const current = best.get(hit.threadId);
        if (current === undefined || hit.distance < current) {
          best.set(hit.threadId, hit.distance);
        }
      }
      return Array.from(best.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([threadId]) => threadId);
    },
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    crmEmailMessage: { findMany: mocks.messageFindMany },
  },
}));

vi.mock("../email-embeddings", () => ({
  semanticSearchChunks: mocks.semanticSearchChunks,
  emailEmbeddingsDisabled: mocks.emailEmbeddingsDisabled,
  rankThreadsFromHits: mocks.rankThreadsFromHits,
}));

import {
  BOOST_SUBJECT,
  fuseRrfScores,
  hybridSearchThreadIds,
  RRF_K,
  RRF_WEIGHT_LEXICAL,
} from "../correos-search-hybrid";
import { parseCorreoSearchQuery } from "../correos-search";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  mocks.emailEmbeddingsDisabled.mockReturnValue(false);
  mocks.rankThreadsFromHits.mockImplementation(
    (hits: Array<{ threadId: string; distance: number }>, limit: number) => {
      const best = new Map<string, number>();
      for (const hit of hits) {
        const current = best.get(hit.threadId);
        if (current === undefined || hit.distance < current) {
          best.set(hit.threadId, hit.distance);
        }
      }
      return Array.from(best.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([threadId]) => threadId);
    },
  );
});

describe("fuseRrfScores", () => {
  it("fusiona ranks y prioriza coincidencia en ambas ramas", () => {
    const scores = fuseRrfScores({
      lexicalIds: ["a", "b", "c"],
      semanticIds: ["c", "d"],
      terms: [],
    });
    const ranked = Array.from(scores.entries())
      .sort((x, y) => y[1] - x[1])
      .map(([id]) => id);
    expect(ranked[0]).toBe("c");
    expect(ranked).toContain("a");
    expect(ranked).toContain("d");
  });

  it("boost de asunto no reordena un match de asunto en pos 3 sobre pos 1", () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    const lexicalIds = ["top", "mid", "bottom"];
    const lexicalMeta = new Map([
      [
        "top",
        {
          id: "top",
          last_message_at: now,
          subject: "factura urgente",
          is_unread: false,
          attachment_count: 0,
          account_id: null,
        },
      ],
      [
        "mid",
        {
          id: "mid",
          last_message_at: now,
          subject: "otro",
          is_unread: false,
          attachment_count: 0,
          account_id: null,
        },
      ],
      [
        "bottom",
        {
          id: "bottom",
          last_message_at: now,
          subject: "factura",
          is_unread: true,
          attachment_count: 5,
          account_id: "acc",
        },
      ],
    ]);
    const scores = fuseRrfScores({
      lexicalIds,
      semanticIds: [],
      lexicalMeta,
      terms: ["factura"],
      now,
    });
    const topScore = scores.get("top")!;
    const bottomScore = scores.get("bottom")!;
    expect(topScore).toBeGreaterThan(bottomScore);
    expect(BOOST_SUBJECT).toBeLessThan(
      RRF_WEIGHT_LEXICAL / (RRF_K + 1) - RRF_WEIGHT_LEXICAL / (RRF_K + 3),
    );
  });
});

describe("hybridSearchThreadIds", () => {
  it("sin términos de texto: solo léxico, sin embeddings", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: "t1",
        last_message_at: new Date(),
        subject: "x",
        is_unread: true,
        attachment_count: 0,
        account_id: null,
      },
    ]);
    const parsed = parseCorreoSearchQuery("is:unread")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "inbox",
      limit: 10,
    });
    expect(result.ids).toEqual(["t1"]);
    expect(result.reasonById.get("t1")).toBe("lexical");
    expect(mocks.semanticSearchChunks).not.toHaveBeenCalled();
  });

  it("degrada a solo léxico si la rama vectorial falla", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: "lex1",
        last_message_at: new Date(),
        subject: "dotación",
        is_unread: false,
        attachment_count: 0,
        account_id: null,
      },
    ]);
    mocks.semanticSearchChunks.mockRejectedValue(new Error("openai down"));
    const parsed = parseCorreoSearchQuery("dotación")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "inbox",
      limit: 10,
    });
    expect(result.ids).toEqual(["lex1"]);
    expect(result.semanticAvailable).toBe(false);
    expect(result.reasonById.get("lex1")).toBe("lexical");
  });

  it("marca both cuando el hilo aparece en ambas ramas", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: "shared",
        last_message_at: new Date(),
        subject: "ampliar dotación",
        is_unread: false,
        attachment_count: 0,
        account_id: null,
      },
      {
        id: "only-lex",
        last_message_at: new Date(),
        subject: "otro",
        is_unread: false,
        attachment_count: 0,
        account_id: null,
      },
    ]);
    mocks.semanticSearchChunks.mockResolvedValue([
      {
        threadId: "shared",
        messageId: "m1",
        content: "necesitamos ampliar la dotación",
        distance: 0.1,
      },
      {
        threadId: "only-sem",
        messageId: "m2",
        content: "más personal",
        distance: 0.2,
      },
    ]);
    const parsed = parseCorreoSearchQuery("dotación")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "sent",
      limit: 10,
    });
    expect(result.reasonById.get("shared")).toBe("both");
    expect(result.ids).toContain("shared");
    expect(result.hasExactMatches).toBe(true);
    expect(mocks.semanticSearchChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        folderSql: expect.anything(),
        structuralSql: expect.any(Array),
      }),
    );
  });

  it("descarta hits semánticos sobre el umbral cuando léxico está vacío", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    mocks.semanticSearchChunks.mockResolvedValue([
      {
        threadId: "far",
        messageId: "m1",
        content: "noise",
        distance: 0.9,
      },
    ]);
    const parsed = parseCorreoSearchQuery("asdfgh")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "inbox",
      limit: 10,
    });
    expect(result.ids).toEqual([]);
    expect(result.hasExactMatches).toBe(false);
    expect(result.discardedSemantic).toBe(1);
  });

  it("respeta folderOverride in:trash del parser", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const parsed = parseCorreoSearchQuery("factura in:trash")!;
    await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "inbox",
      limit: 5,
    });
    const sqlArg = mocks.queryRaw.mock.calls[0][0];
    expect(sqlArg.sql).toContain("t.trashed_at IS NOT NULL");
  });

  it("offset desplaza el ranking sin perder ni duplicar IDs", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      last_message_at: new Date(),
      subject: `asunto ${i}`,
      is_unread: false,
      attachment_count: 0,
      account_id: null,
    }));
    mocks.queryRaw.mockResolvedValue(rows);
    mocks.semanticSearchChunks.mockResolvedValue([]);
    const parsed = parseCorreoSearchQuery("asunto")!;
    const page1 = await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "all",
      limit: 3,
      offset: 0,
    });
    const page2 = await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "all",
      limit: 3,
      offset: 3,
    });
    expect(page1.ids).toHaveLength(3);
    expect(page2.ids).toHaveLength(3);
    expect(new Set([...page1.ids, ...page2.ids]).size).toBe(6);
    expect(page1.totalCount).toBe(8);
    expect(page1.ids.some((id) => page2.ids.includes(id))).toBe(false);
  });

  it("excerptById queda poblado para matches léxicos puros", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: "lex-only",
        last_message_at: new Date(),
        subject: "cotización",
        is_unread: false,
        attachment_count: 0,
        account_id: null,
      },
    ]);
    mocks.semanticSearchChunks.mockResolvedValue([]);
    mocks.messageFindMany.mockResolvedValue([
      {
        threadId: "lex-only",
        textBody: "Necesitamos cotización de 4 guardias para Macronet.",
        htmlBody: null,
        sentAt: new Date(),
      },
    ]);
    const parsed = parseCorreoSearchQuery("cotización")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten",
      emailAccountIds: ["00000000-0000-0000-0000-000000000001"],
      parsed,
      folder: "all",
      limit: 10,
    });
    expect(result.reasonById.get("lex-only")).toBe("lexical");
    expect(result.excerptById.get("lex-only")).toMatch(/cotización/i);
  });
});
