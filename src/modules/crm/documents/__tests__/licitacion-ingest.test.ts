import { describe, expect, it } from "vitest";
import {
  LICITACION_TIPO_CODIGOS,
  assembleCorpusChunks,
  estimateTokenCount,
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
});

describe("assembleCorpusChunks budget", () => {
  it("prioriza Bases > Q&A > Anexos y marca truncado", () => {
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
      ],
      100,
    );
    expect(truncated).toBe(true);
    expect(chunks[0]?.kind).toBe("bases");
    expect(chunks[0]?.text.startsWith("B")).toBe(true);
    expect(chunks[0]?.text.length).toBeGreaterThan(10);
    const anex = chunks.find((c) => c.kind === "anexos");
    expect(anex?.truncated || !anex?.text).toBe(true);
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
