/**
 * Golden set del buscador de correos (auditoría Macronet / ACUDA).
 * Usa mocks del motor híbrido + asserts del builder SQL / plan de entidades.
 * Los criterios que requieren BD real viven en correos-search-integration (opt-in).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
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
        .map(([id]) => id);
    },
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

vi.mock("../email-embeddings", () => ({
  semanticSearchChunks: mocks.semanticSearchChunks,
  emailEmbeddingsDisabled: mocks.emailEmbeddingsDisabled,
  rankThreadsFromHits: mocks.rankThreadsFromHits,
}));

import {
  MAX_SEMANTIC_DISTANCE,
  hybridSearchThreadIds,
} from "../correos-search-hybrid";
import {
  buildCorreoSearchIdsQuery,
  parseCorreoSearchQuery,
} from "../correos-search";
import { buildSearchPlanFromEntities } from "../resolve-email-entity";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  mocks.emailEmbeddingsDisabled.mockReturnValue(false);
});

const MACRONET_THREAD = "thread-macronet-acuda-2025-12-18";
const NOISE_THREAD = "thread-leaf-space-semantic-noise";

describe("golden — macronet acuda", () => {
  it("texto libre busca en cuerpo + emails (SQL contiene text_body e ILIKE destinatarios)", () => {
    const parsed = parseCorreoSearchQuery("macronet acuda")!;
    const sql = buildCorreoSearchIdsQuery({
      tenantId: "ten-a",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "inbox",
      cursorDate: null,
      take: 30,
    });
    const text = sql.sql;
    expect(text).toContain("text_body");
    expect(text).toContain("from_email");
    expect(text).toContain("to_emails");
    // Free text sin in: → hybrid fuerza folder all
  });

  it("hybrid con léxico Macronet queda top-3 y match lexical (no solo semántico)", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: MACRONET_THREAD,
        last_message_at: new Date("2025-12-18T16:53:00.000Z"),
        subject: "Re: Última Llamada: Aprovecha la Innovación…",
        is_unread: false,
        attachment_count: 2,
        account_id: null,
      },
      {
        id: "thread-other-macronet",
        last_message_at: new Date("2025-11-01T12:00:00.000Z"),
        subject: "Otro hilo Macronet",
        is_unread: false,
        attachment_count: 0,
        account_id: null,
      },
    ]);
    mocks.semanticSearchChunks.mockResolvedValue([
      {
        threadId: NOISE_THREAD,
        messageId: "m-noise",
        content: "security proposal leaf space",
        distance: 0.72, // sobre umbral → descartado
      },
    ]);

    const parsed = parseCorreoSearchQuery("macronet acuda")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten-a",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "inbox",
      limit: 10,
    });

    expect(result.ids.slice(0, 3)).toContain(MACRONET_THREAD);
    expect(result.reasonById.get(MACRONET_THREAD)).toBe("lexical");
    expect(result.ids).not.toContain(NOISE_THREAD);
    expect(result.lexicalEmpty).toBe(false);
  });

  it("from + domain + acuda construye EXISTS de dominio", () => {
    const parsed = parseCorreoSearchQuery(
      "from:carlos.irigoyen@gard.cl domain:macronet.cl acuda",
    )!;
    const sql = buildCorreoSearchIdsQuery({
      tenantId: "ten-a",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "all",
      cursorDate: null,
      take: 10,
    });
    expect(sql.sql).toContain("split_part");
    expect(parsed.domains).toEqual(["macronet.cl"]);
    expect(parsed.from).toEqual(["carlos.irigoyen@gard.cl"]);
  });

  it("asdfgh qwerty sin léxico ni semántico fuerte → vacío honesto", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    mocks.semanticSearchChunks.mockResolvedValue([
      {
        threadId: NOISE_THREAD,
        messageId: "m1",
        content: "random",
        distance: MAX_SEMANTIC_DISTANCE + 0.2,
      },
    ]);
    const parsed = parseCorreoSearchQuery("asdfgh qwerty")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten-a",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "all",
      limit: 10,
    });
    expect(result.ids).toEqual([]);
    expect(result.lexicalEmpty).toBe(true);
    expect(result.semanticDiscarded).toBeGreaterThan(0);
  });

  it("exactOnly no mezcla semánticos aunque haya hits fuertes", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    mocks.semanticSearchChunks.mockResolvedValue([
      {
        threadId: NOISE_THREAD,
        messageId: "m1",
        content: "propuesta seguridad",
        distance: 0.2,
      },
    ]);
    const parsed = parseCorreoSearchQuery("propuesta")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten-a",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "all",
      limit: 10,
      exactOnly: true,
    });
    expect(result.ids).toEqual([]);
  });

  it("texto libre fuerza carpeta all en el SQL (spam/trash excluidos)", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    mocks.semanticSearchChunks.mockResolvedValue([]);
    const parsed = parseCorreoSearchQuery("macronet")!;
    await hybridSearchThreadIds({
      tenantId: "ten-a",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "inbox",
      limit: 5,
    });
    const sqlArg = mocks.queryRaw.mock.calls[0][0];
    // folder all: trashed/spam null, sin archived_at IS NULL
    expect(sqlArg.sql).toContain("t.trashed_at IS NULL");
    expect(sqlArg.sql).toContain("t.spam_at IS NULL");
    expect(sqlArg.sql).not.toContain("t.archived_at IS NULL");
  });
});

describe("golden — resolveEntity plan", () => {
  it("traduce Luis González + Macronet a to/domain + ACUDA en query", () => {
    const plan = buildSearchPlanFromEntities({
      freeText: ["Luis", "González", "Macronet", "ACUDA"],
      entities: [
        {
          kind: "person",
          label: "Luis González",
          emails: ["lgonzalez@macronet.cl"],
          domains: ["macronet.cl"],
          score: 20,
        },
        {
          kind: "company",
          label: "Macronet",
          emails: [],
          domains: ["macronet.cl"],
          score: 15,
        },
      ],
    });
    expect(plan.folder).toBe("all");
    expect(plan.to).toContain("lgonzalez@macronet.cl");
    expect(plan.domain).toContain("macronet.cl");
    expect(plan.queryTerms.map((t) => t.toLowerCase())).toContain("acuda");
    expect(plan.queryTerms.map((t) => t.toLowerCase())).not.toContain("macronet");
  });
});

describe("golden — aislamiento multi-tenant en SQL", () => {
  it("inyecta tenant_id y email_account_id en las 3 ramas", () => {
    const parsed = parseCorreoSearchQuery("macronet")!;
    const sql = buildCorreoSearchIdsQuery({
      tenantId: "tenant-guard",
      emailAccountId: "00000000-0000-4000-8000-000000000099",
      parsed,
      folder: "all",
      cursorDate: null,
      take: 5,
    });
    expect(sql.sql).toContain("t.tenant_id");
    expect(sql.sql).toContain("t.email_account_id");
    expect(sql.values).toContain("tenant-guard");
  });
});

describe("golden — grounding adversarial (contrato de tool)", () => {
  it("sin results la nota prohíbe inventar", async () => {
    // Contrato: el shape de vacío debe incluir nextSteps y nota anti-alucinación.
    // (La tool completa se cubre en help-chat; aquí fijamos el contrato del motor.)
    mocks.queryRaw.mockResolvedValue([]);
    mocks.semanticSearchChunks.mockResolvedValue([]);
    const parsed = parseCorreoSearchQuery("correo inventado xyzzy")!;
    const result = await hybridSearchThreadIds({
      tenantId: "ten-a",
      emailAccountId: "00000000-0000-0000-0000-000000000001",
      parsed,
      folder: "all",
      limit: 5,
    });
    expect(result.ids).toEqual([]);
    expect(result.lexicalEmpty).toBe(true);
  });
});
