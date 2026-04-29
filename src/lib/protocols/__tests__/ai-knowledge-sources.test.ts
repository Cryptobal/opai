import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// Prisma mock
// ────────────────────────────────────────────────────────────────────────────

type DocRow = {
  id: string;
  tenantId: string;
  capa: "global" | "instalacion";
  installationId: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  status: string;
  tipo: { codigo: string; nombre: string; useAsAiKnowledge: boolean } | null;
};

type LegacyRow = {
  id: string;
  tenantId: string;
  scope: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
};

const state: {
  docs: DocRow[];
  legacy: LegacyRow[];
} = { docs: [], legacy: [] };

function applyDocsFilter(args: {
  where: {
    tenantId: string;
    capa: string;
    installationId?: string | null;
    status?: { not: string };
    tipo?: { useAsAiKnowledge: boolean };
    id?: { in: string[] };
  };
}) {
  const w = args.where;
  return state.docs.filter((d) => {
    if (d.tenantId !== w.tenantId) return false;
    if (d.capa !== w.capa) return false;
    if (w.installationId !== undefined && d.installationId !== w.installationId) return false;
    if (w.status?.not && d.status === w.status.not) return false;
    if (w.tipo?.useAsAiKnowledge !== undefined && d.tipo?.useAsAiKnowledge !== w.tipo.useAsAiKnowledge) return false;
    if (w.id?.in && !w.id.in.includes(d.id)) return false;
    return true;
  });
}

function applyLegacyFilter(args: {
  where: {
    tenantId: string;
    scope: string;
    id?: { in: string[] };
  };
}) {
  const w = args.where;
  return state.legacy.filter((d) => {
    if (d.tenantId !== w.tenantId) return false;
    if (d.scope !== w.scope) return false;
    if (w.id?.in && !w.id.in.includes(d.id)) return false;
    return true;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    docOperacional: {
      findMany: vi.fn(async (args: Parameters<typeof applyDocsFilter>[0]) => applyDocsFilter(args)),
    },
    protocolDocument: {
      findMany: vi.fn(async (args: Parameters<typeof applyLegacyFilter>[0]) => applyLegacyFilter(args)),
    },
  },
}));

import {
  getAiKnowledgeSources,
  rankSourcesForPrompt,
  type AiKnowledgeSource,
} from "@/lib/protocols/ai-knowledge-sources";

const TENANT = "t1";
const INSTALLATION = "inst-1";

function makeDoc(overrides: Partial<DocRow> & { id: string; capa: "global" | "instalacion" }): DocRow {
  return {
    id: overrides.id,
    tenantId: TENANT,
    capa: overrides.capa,
    installationId: overrides.installationId ?? null,
    fileName: overrides.fileName ?? `${overrides.id}.pdf`,
    fileUrl: overrides.fileUrl ?? `https://r2/${overrides.id}.pdf`,
    fileSize: overrides.fileSize ?? 1024,
    status: overrides.status ?? "vigente",
    tipo: overrides.tipo ?? {
      codigo: "protocolo_emergencias",
      nombre: "Protocolo de Emergencias",
      useAsAiKnowledge: true,
    },
  };
}

describe("getAiKnowledgeSources", () => {
  beforeEach(() => {
    state.docs = [];
    state.legacy = [];
  });

  it("devuelve docs operacionales globales marcados como base de IA", async () => {
    state.docs = [
      makeDoc({ id: "d1", capa: "global" }),
      makeDoc({
        id: "d2",
        capa: "global",
        tipo: { codigo: "matriz_riesgo", nombre: "Matriz de Riesgos", useAsAiKnowledge: true },
        fileName: "matriz.pdf",
      }),
    ];

    const result = await getAiKnowledgeSources({ tenantId: TENANT });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.origin === "doc_operacional")).toBe(true);
    expect(result.every((r) => r.scope === "global")).toBe(true);
  });

  it("hace fallback al sistema legacy cuando no hay docs operacionales globales", async () => {
    state.docs = [];
    state.legacy = [
      {
        id: "L1",
        tenantId: TENANT,
        scope: "global",
        fileName: "viejo.pdf",
        fileUrl: "https://r2/viejo.pdf",
        fileSize: 5_000,
      },
    ];

    const result = await getAiKnowledgeSources({ tenantId: TENANT });
    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("protocol_document_legacy");
    expect(result[0].fileName).toBe("viejo.pdf");
  });

  it("incluye docs de instalación cuando se pasa installationId", async () => {
    state.docs = [
      makeDoc({ id: "g1", capa: "global" }),
      makeDoc({
        id: "i1",
        capa: "instalacion",
        installationId: INSTALLATION,
        fileName: "manual_instalacion.pdf",
        tipo: { codigo: "manual_seguridad", nombre: "Manual de Seguridad", useAsAiKnowledge: true },
      }),
    ];

    const result = await getAiKnowledgeSources({
      tenantId: TENANT,
      installationId: INSTALLATION,
    });

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.scope === "instalacion")?.fileName).toBe(
      "manual_instalacion.pdf",
    );
  });

  it("excluye tipos con useAsAiKnowledge=false (filtrado por DB en where)", async () => {
    // El where en `findMany` ya filtra por tipo.useAsAiKnowledge=true, así
    // que aquí solo metemos el doc que NO debe aparecer y verificamos que
    // el resultado quede vacío (con fallback legacy también vacío).
    state.docs = [
      makeDoc({
        id: "d1",
        capa: "global",
        tipo: { codigo: "poliza", nombre: "Póliza", useAsAiKnowledge: false },
      }),
    ];

    const result = await getAiKnowledgeSources({ tenantId: TENANT });
    expect(result).toHaveLength(0);
  });

  it("excluye documentos vencidos (status=vencido)", async () => {
    state.docs = [
      makeDoc({ id: "d1", capa: "global", status: "vencido" }),
      makeDoc({ id: "d2", capa: "global", status: "vigente" }),
    ];

    const result = await getAiKnowledgeSources({ tenantId: TENANT });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d2");
  });

  it("respeta documentIds cuando se pasan", async () => {
    state.docs = [
      makeDoc({ id: "d1", capa: "global" }),
      makeDoc({ id: "d2", capa: "global" }),
      makeDoc({ id: "d3", capa: "global" }),
    ];

    const result = await getAiKnowledgeSources({
      tenantId: TENANT,
      documentIds: ["d1", "d3"],
    });
    expect(result.map((r) => r.id).sort()).toEqual(["d1", "d3"]);
  });
});

describe("rankSourcesForPrompt", () => {
  function s(
    id: string,
    codigo: string | null,
    scope: AiKnowledgeSource["scope"] = "global",
  ): AiKnowledgeSource {
    return {
      id,
      origin: "doc_operacional",
      scope,
      fileName: `${id}.pdf`,
      fileUrl: `https://r2/${id}.pdf`,
      fileSize: 1,
      tipoCodigo: codigo,
      tipoNombre: codigo,
      installationId: null,
    };
  }

  it("ordena por prioridad: matriz_riesgo > plan_emergencia > plan_evacuacion > otros", () => {
    const sources = [
      s("a", "manual_seguridad"),
      s("b", "matriz_riesgo"),
      s("c", "plan_evacuacion"),
      s("d", "plan_emergencia"),
    ];

    const ranked = rankSourcesForPrompt(sources).map((x) => x.tipoCodigo);
    expect(ranked).toEqual([
      "matriz_riesgo",
      "plan_emergencia",
      "plan_evacuacion",
      "manual_seguridad",
    ]);
  });

  it("instalación > global cuando tienen la misma prioridad", () => {
    const sources = [
      s("a", "matriz_riesgo", "global"),
      s("b", "matriz_riesgo", "instalacion"),
    ];
    const ranked = rankSourcesForPrompt(sources);
    expect(ranked[0].id).toBe("b");
    expect(ranked[1].id).toBe("a");
  });
});
