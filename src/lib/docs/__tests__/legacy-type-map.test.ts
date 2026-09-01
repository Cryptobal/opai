import { describe, expect, it } from "vitest";
import {
  humanizeTypeCode,
  normalizeLegacyTypeCode,
  resolveLegacyType,
} from "@/lib/docs/legacy-type-map";

describe("legacy-type-map", () => {
  it("mapea códigos que coinciden con el catálogo", () => {
    expect(resolveLegacyType("certificado_antecedentes", false)).toEqual({
      kind: "mapped",
      codigo: "certificado_antecedentes",
    });
    expect(resolveLegacyType("contrato_guardia", true)).toEqual({
      kind: "mapped",
      codigo: "contrato_guardia",
    });
    expect(resolveLegacyType("examen_psicologico", true)).toEqual({
      kind: "mapped",
      codigo: "examen_psicologico",
    });
  });

  it("mapea alias conocidos que no coinciden con el catálogo seed", () => {
    expect(resolveLegacyType("contrato", false)?.kind).toBe("mapped");
    expect(resolveLegacyType("contrato", false)).toMatchObject({
      codigo: "contrato_guardia",
    });
    expect(resolveLegacyType("anexo", false)).toMatchObject({
      kind: "mapped",
      codigo: "anexo_contrato",
    });
    expect(resolveLegacyType("anexo_contrato", false)).toMatchObject({
      kind: "mapped",
      codigo: "anexo_contrato",
    });
    expect(resolveLegacyType("examen", true)).toMatchObject({
      kind: "mapped",
      codigo: "examen_psicologico",
    });
    expect(resolveLegacyType("certificado_afp", false)).toMatchObject({
      kind: "mapped",
      codigo: "certificado_afp",
    });
    expect(resolveLegacyType("certificado_fonasa_isapre", false)).toMatchObject({
      kind: "mapped",
      codigo: "certificado_fonasa_isapre",
    });
    expect(resolveLegacyType("certificado_ensenanza_media", false)).toMatchObject({
      kind: "mapped",
      codigo: "certificado_ensenanza_media",
    });
  });

  it("nunca resuelve a sin_clasificar", () => {
    const r = resolveLegacyType("algo_raro_xyz", false);
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("create");
    if (r?.kind === "create") {
      expect(r.codigo).not.toBe("sin_clasificar");
      expect(r.normativa).toBeNull();
      expect(r.obligatorio).toBe(false);
    }
  });

  it("crea tipo nuevo con tieneVencimiento inferido", () => {
    const withExpiry = resolveLegacyType("Licencia Municipal!", true);
    expect(withExpiry).toMatchObject({
      kind: "create",
      codigo: "licencia_municipal",
      nombre: "Licencia Municipal",
      tieneVencimiento: true,
      diasAlerta: 30,
      normativa: null,
    });

    const without = resolveLegacyType("foto_carnet", false);
    expect(without).toMatchObject({
      kind: "create",
      codigo: "foto_carnet",
      tieneVencimiento: false,
    });
  });

  it("normaliza y humaniza códigos", () => {
    expect(normalizeLegacyTypeCode("  Certificado AFP  ")).toBe("certificado_afp");
    expect(humanizeTypeCode("certificado_afp")).toBe("Certificado Afp");
  });

  it("rechaza códigos vacíos, undefined y null", () => {
    expect(normalizeLegacyTypeCode("")).toBeNull();
    expect(normalizeLegacyTypeCode("   ")).toBeNull();
    expect(normalizeLegacyTypeCode("undefined")).toBeNull();
    expect(normalizeLegacyTypeCode("null")).toBeNull();
    expect(normalizeLegacyTypeCode(undefined)).toBeNull();
    expect(normalizeLegacyTypeCode(null)).toBeNull();
    expect(resolveLegacyType("undefined", false)).toBeNull();
    expect(resolveLegacyType("null", true)).toBeNull();
    expect(resolveLegacyType("", false)).toBeNull();
  });
});
