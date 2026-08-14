import { describe, expect, it } from "vitest";
import {
  LICITACION_TIPO_CODIGOS,
  assembleCorpusChunks,
  estimateTokenCount,
  fileNeedsLicitacionClassification,
  isGeneratedProposalFileName,
  kindFromCodigo,
  licitacionSlotState,
  resolveLicitacionTipoOnUpload,
  suggestTipoFromFileName,
} from "../licitacion-corpus";

describe("suggestTipoFromFileName", () => {
  it("detecta bases, Q&A y anexos", () => {
    expect(suggestTipoFromFileName("Bases_Licitacion_Baumax.pdf")).toBe(
      LICITACION_TIPO_CODIGOS.bases,
    );
    expect(suggestTipoFromFileName("Preguntas_y_respuestas.docx")).toBe(LICITACION_TIPO_CODIGOS.qa);
    expect(suggestTipoFromFileName("Anexo_3_planos.pdf")).toBe(LICITACION_TIPO_CODIGOS.anexos);
    expect(suggestTipoFromFileName("foto.jpg")).toBeNull();
  });

  it("clasifica bases administrativas antes del regex genérico de bases", () => {
    expect(suggestTipoFromFileName("Bases_Administrativas.pdf")).toBe(
      LICITACION_TIPO_CODIGOS.bases_admin,
    );
    expect(suggestTipoFromFileName("bases administrativas Codelco.pdf")).toBe(
      LICITACION_TIPO_CODIGOS.bases_admin,
    );
    expect(suggestTipoFromFileName("Pliego_administrativo.docx")).toBe(
      LICITACION_TIPO_CODIGOS.bases_admin,
    );
  });

  it("no sugiere tipo para respaldos de empresa ni propuesta generada", () => {
    expect(suggestTipoFromFileName("OS10_empresa.pdf")).toBeNull();
    expect(suggestTipoFromFileName("poliza_rc.pdf")).toBeNull();
    expect(suggestTipoFromFileName("eRUT.pdf")).toBeNull();
    expect(suggestTipoFromFileName("F30.pdf")).toBeNull();
    expect(suggestTipoFromFileName("escritura_sociedad.pdf")).toBeNull();
    expect(suggestTipoFromFileName("Propuesta técnica — Baumax (borrador).pdf")).toBeNull();
  });
});

describe("isGeneratedProposalFileName", () => {
  it("detecta el PDF de propuesta técnica en borrador", () => {
    expect(isGeneratedProposalFileName("Propuesta técnica — Baumax (borrador).pdf")).toBe(true);
    expect(isGeneratedProposalFileName("Propuesta tecnica - Cliente (borrador).pdf")).toBe(true);
  });

  it("no marca bases ni respaldos como propuesta generada", () => {
    expect(isGeneratedProposalFileName("Bases_Licitacion.pdf")).toBe(false);
    expect(isGeneratedProposalFileName("OS10.pdf")).toBe(false);
    expect(isGeneratedProposalFileName("Propuesta comercial.pdf")).toBe(false);
  });
});

describe("resolveLicitacionTipoOnUpload", () => {
  it("respeta el tipo explícito sobre la sugerencia", () => {
    expect(resolveLicitacionTipoOnUpload("Bases.pdf", LICITACION_TIPO_CODIGOS.otros)).toBe(
      LICITACION_TIPO_CODIGOS.otros,
    );
  });

  it("en Auto usa sugerencia por nombre y Otros para la propuesta generada", () => {
    expect(resolveLicitacionTipoOnUpload("Anexo_1.pdf", "auto")).toBe(LICITACION_TIPO_CODIGOS.anexos);
    expect(resolveLicitacionTipoOnUpload("Propuesta técnica — X (borrador).pdf", "auto")).toBe(
      LICITACION_TIPO_CODIGOS.otros,
    );
    expect(resolveLicitacionTipoOnUpload("OS10.pdf", "auto")).toBeNull();
  });
});

describe("fileNeedsLicitacionClassification", () => {
  it("excluye Otros y el PDF de propuesta autoclasificado", () => {
    expect(
      fileNeedsLicitacionClassification({
        tipoCodigo: LICITACION_TIPO_CODIGOS.otros,
        tipoId: "t1",
        needsClassificationFlag: false,
      }),
    ).toBe(false);
    expect(
      fileNeedsLicitacionClassification({
        tipoCodigo: null,
        tipoId: null,
        needsClassificationFlag: true,
        fileName: "Propuesta técnica — X (borrador).pdf",
      }),
    ).toBe(false);
  });

  it("marca pendientes los archivos sin tipo", () => {
    expect(
      fileNeedsLicitacionClassification({
        tipoCodigo: null,
        tipoId: null,
        needsClassificationFlag: false,
        fileName: "OS10.pdf",
      }),
    ).toBe(true);
  });
});

describe("licitacionSlotState", () => {
  it("Sin clasificar solo con archivos pendientes; Falta si todo está clasificado", () => {
    expect(
      licitacionSlotState({ present: false, extracted: false, hasUnclassified: true }),
    ).toEqual({ label: "Sin clasificar", short: "Sin clasificar", tone: "warn" });
    expect(
      licitacionSlotState({ present: false, extracted: false, hasUnclassified: false }),
    ).toEqual({ label: "Falta", short: "Falta", tone: "neutral" });
    expect(
      licitacionSlotState({
        present: false,
        extracted: false,
        hasUnclassified: false,
        optional: true,
      }),
    ).toEqual({ label: "Opcional", short: "Opcional", tone: "neutral" });
  });

  it("Clasificado ✓ con documento del tipo extraído", () => {
    expect(
      licitacionSlotState({ present: true, extracted: true, hasUnclassified: true }),
    ).toMatchObject({ short: "Clasificado ✓", tone: "ok" });
  });
});

describe("kindFromCodigo", () => {
  it("excluye Otros del corpus", () => {
    expect(kindFromCodigo(LICITACION_TIPO_CODIGOS.otros)).toBeNull();
    expect(kindFromCodigo(LICITACION_TIPO_CODIGOS.bases)).toBe("bases");
  });
});

describe("assembleCorpusChunks budget", () => {
  it("prioriza Bases > Bases administrativas > Q&A > Anexos y marca truncado", () => {
    const { chunks, truncated } = assembleCorpusChunks(
      [
        {
          id: "a",
          fileName: "anexo.pdf",
          tipoCodigo: LICITACION_TIPO_CODIGOS.anexos,
          text: "A".repeat(80),
          status: "ok",
          error: null,
        },
        {
          id: "adm",
          fileName: "bases-admin.pdf",
          tipoCodigo: LICITACION_TIPO_CODIGOS.bases_admin,
          text: "D".repeat(80),
          status: "ok",
          error: null,
        },
        {
          id: "b",
          fileName: "bases.pdf",
          tipoCodigo: LICITACION_TIPO_CODIGOS.bases,
          text: "B".repeat(80),
          status: "ok",
          error: null,
        },
        {
          id: "q",
          fileName: "qa.pdf",
          tipoCodigo: LICITACION_TIPO_CODIGOS.qa,
          text: "Q".repeat(80),
          status: "ok",
          error: null,
        },
        {
          id: "o",
          fileName: "os10.pdf",
          tipoCodigo: LICITACION_TIPO_CODIGOS.otros,
          text: "O".repeat(80),
          status: "ok",
          error: null,
        },
      ],
      100,
    );
    expect(truncated).toBe(true);
    expect(chunks[0]?.kind).toBe("bases");
    expect(chunks[1]?.kind).toBe("bases_admin");
    expect(chunks[0]?.text.startsWith("B")).toBe(true);
    expect(chunks[0]?.text.length).toBeGreaterThan(10);
    const anex = chunks.find((c) => c.kind === "anexos");
    expect(anex?.truncated || !anex?.text).toBe(true);
    expect(chunks.some((c) => c.tipoCodigo === LICITACION_TIPO_CODIGOS.otros)).toBe(false);
  });

  it("conserva chunks en error sin gastar presupuesto", () => {
    const { chunks, truncated } = assembleCorpusChunks(
      [
        {
          id: "b",
          fileName: "bases.pdf",
          tipoCodigo: LICITACION_TIPO_CODIGOS.bases,
          text: "",
          status: "error",
          error: "PDF sin texto",
        },
      ],
      50,
    );
    expect(truncated).toBe(false);
    expect(chunks[0]?.status).toBe("error");
  });
});

describe("estimateTokenCount", () => {
  it("aproxima 4 chars por token", () => {
    expect(estimateTokenCount("abcd")).toBe(1);
    expect(estimateTokenCount("a".repeat(8))).toBe(2);
  });
});
