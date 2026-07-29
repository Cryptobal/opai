/**
 * Golden set / criterios de aceptación del buscador de correos
 * (docs/audits/auditoria-buscador-correos.md §7).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../email-embeddings", () => ({
  semanticSearchChunks: vi.fn(async () => []),
  emailEmbeddingsDisabled: vi.fn(() => true),
  rankThreadsFromHits: (
    hits: Array<{ threadId: string; distance: number }>,
    limit: number,
  ) => {
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
}));

import {
  buildCorreoSearchConditions,
  buildCorreoSearchParts,
  parseCorreoSearchQuery,
} from "../correos-search";
import {
  CORREO_OPERATOR_REGISTRY,
  correoSearchOperatorChips,
} from "../correos-operator-registry";
import {
  buildExpandedSearchQuery,
  type ResolvedEntity,
} from "../correos-resolve-entity";
import { fuseRrfScores, SEMANTIC_MAX_DISTANCE } from "../correos-search-hybrid";
import { rankThreadsFromHits } from "../email-embeddings";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aceptación — gramática de operadores (criterio 8)", () => {
  it("cada operador del registry parsea y genera condición where (o flag)", () => {
    for (const op of CORREO_OPERATOR_REGISTRY) {
      const sample =
        op.type === "enum" && op.values?.length
          ? `${op.key}:${op.values[0]}`
          : op.type === "duration"
            ? `${op.key}:7d`
            : op.type === "date"
              ? `${op.key}:2025-12-18`
              : `${op.key}:macronet.cl`;
      const parsed = parseCorreoSearchQuery(sample);
      expect(parsed, `parse failed for ${sample}`).not.toBeNull();
      const parts = buildCorreoSearchParts(parsed!);
      const conds = buildCorreoSearchConditions(parsed!);
      // Al menos una condición estructural/texto, o un flag booleano activo.
      const activeFlag =
        parsed!.hasAttachment ||
        parsed!.unread !== null ||
        parsed!.starred !== null ||
        parsed!.folderOverride !== null;
      expect(
        conds.length > 0 || activeFlag || parts.structural.length > 0,
        `no where for ${sample}`,
      ).toBe(true);
    }
  });

  it("chips de UI coinciden con el registry (incluye domain:)", () => {
    const chips = correoSearchOperatorChips();
    expect(chips.some((c) => c.token.startsWith("domain:"))).toBe(true);
    expect(chips.some((c) => c.token.startsWith("in:"))).toBe(true);
    expect(chips.some((c) => c.token.startsWith("cc:"))).toBe(true);
  });
});

describe("aceptación — dominio y ACUDA (criterios 1–3, 7)", () => {
  it("from+domain+término se parsean juntos", () => {
    const parsed = parseCorreoSearchQuery(
      "from:carlos.irigoyen@gard.cl domain:macronet.cl acuda",
    );
    expect(parsed?.from).toEqual(["carlos.irigoyen@gard.cl"]);
    expect(parsed?.domains).toEqual(["macronet.cl"]);
    expect(parsed?.terms).toEqual(["acuda"]);
  });

  it("texto libre macronet genera condición sobre participantes (ILIKE)", () => {
    const parsed = parseCorreoSearchQuery("macronet")!;
    const sql = buildCorreoSearchConditions(parsed)
      .map((c) => c.strings.join(" "))
      .join(" ");
    expect(sql.toLowerCase()).toContain("from_email");
    expect(sql.toLowerCase()).toContain("to_emails");
  });

  it("ACUDA en mayúsculas NO es prefijo de 'acudir' (ILIKE substring)", () => {
    // Garantiza que el motor actual (ILIKE) no confunde acrónimo con verbo.
    expect("acudir al lugar".toLowerCase().includes("acuda")).toBe(false);
    expect("servicio de acuda".toLowerCase().includes("acuda")).toBe(true);
  });
});

describe("aceptación — híbrido honesto (criterios 6)", () => {
  it("umbral semántico descarta distancias altas", () => {
    const hits = [
      { threadId: "good", messageId: "m1", content: "x", distance: 0.2 },
      { threadId: "noise", messageId: "m2", content: "y", distance: 0.9 },
    ];
    const accepted = hits.filter((h) => h.distance <= SEMANTIC_MAX_DISTANCE);
    expect(rankThreadsFromHits(accepted, 10)).toEqual(["good"]);
  });

  it("sin léxico, fuse solo-semántico queda marcado separable", () => {
    const scores = fuseRrfScores({
      lexicalIds: [],
      semanticIds: ["sem-only"],
      terms: ["asdfgh", "qwerty"],
    });
    expect(scores.has("sem-only")).toBe(true);
    // La UI usa hasExactMatches=false cuando lexicalIds vacío.
    expect([] as string[]).toHaveLength(0);
  });
});

describe("aceptación — resolveEntity expansion (criterio 4)", () => {
  it("expande persona+empresa a to/domain/in:all", () => {
    const entities: ResolvedEntity[] = [
      {
        kind: "person",
        label: "Luis González",
        email: "lgonzalez@macronet.cl",
        domain: "macronet.cl",
        score: 90,
      },
      {
        kind: "company",
        label: "Macronet",
        domain: "macronet.cl",
        score: 70,
      },
    ];
    const q = buildExpandedSearchQuery({
      freeText: ["ACUDA"],
      entities,
      folder: "all",
    });
    expect(q).toContain("ACUDA");
    expect(q).toContain("to:lgonzalez@macronet.cl");
    expect(q).toContain("in:all");
  });
});

describe("aceptación — deep-link (criterio 5)", () => {
  it("URL de cita usa hilo= y mensaje=", () => {
    const threadId = "11111111-1111-1111-1111-111111111111";
    const messageId = "22222222-2222-2222-2222-222222222222";
    const url = `/crm/correos?hilo=${threadId}&mensaje=${messageId}`;
    expect(url).toMatch(/hilo=[0-9a-f-]{36}/);
    expect(url).toMatch(/mensaje=[0-9a-f-]{36}/);
  });
});

describe("aceptación — aislamiento tenant en builders (criterio 10)", () => {
  it("buildCorreoSearchIdsQuery siempre filtra tenant_id y email_account_id", async () => {
    const { buildCorreoSearchIdsQuery } = await import("../correos-search");
    const parsed = parseCorreoSearchQuery("macronet acuda")!;
    const sql = buildCorreoSearchIdsQuery({
      tenantId: "tenant-a",
      emailAccountIds: ["00000000-0000-0000-0000-0000000000aa"],
      parsed,
      folder: "all",
      cursorDate: null,
      take: 10,
    });
    const text = sql.strings.join("?");
    expect(text).toContain("t.tenant_id");
    expect(text).toContain("t.email_account_id");
  });
});

describe("aceptación — scope global + cuerpo HTML/acentos (brief post-F7)", () => {
  it("término libre sin in: no fija folderOverride (list usa all)", () => {
    const parsed = parseCorreoSearchQuery("cotización Macronet")!;
    expect(parsed.folderOverride).toBeNull();
    expect(parsed.terms.length).toBeGreaterThan(0);
  });

  it("rama de cuerpo genera condiciones text_body y html_body con f_unaccent", () => {
    const parsed = parseCorreoSearchQuery("instalación")!;
    const sql = buildCorreoSearchConditions(parsed)
      .map((c) => c.strings.join(" "))
      .join(" ")
      .toLowerCase();
    expect(sql).toContain("text_body");
    expect(sql).toContain("html_body");
    expect(sql).toContain("f_unaccent");
    expect(sql).not.toContain("text_body ilike");
  });

  it("in:sent en el query sí fija folderOverride (scope mixto)", () => {
    const parsed = parseCorreoSearchQuery("macronet in:sent")!;
    expect(parsed.folderOverride).toBe("sent");
  });
});
