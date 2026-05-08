/**
 * Tests del validator de mérito ejecutivo (Ley 19.983) del AEC.
 *
 * La función vive en `@/lib/sii/aec-validator` y la consumen ambos
 * adapters de cesión: SimpleAPI (`simpleapi-cesion`) y directo SII
 * (`sii-direct-cesion`). Antes vivía solo en simpleapi-cesion;
 * extraída acá para compartir.
 */

import { describe, expect, it } from "vitest";
import { validateAecMeritoEjecutivo } from "../aec-validator";

function aec(parts: string): Buffer {
  // Convertir con latin1 para matchear el encoding real del AEC.
  return Buffer.from(parts, "latin1");
}

describe("validateAecMeritoEjecutivo", () => {
  it("OK cuando hay <DocumentoAEC> + <Signature> + <DeclaracionJurada>", () => {
    const xml = aec(
      `<AEC><DocumentoAEC><DeclaracionJurada>...Ley Nro 19.983...</DeclaracionJurada></DocumentoAEC><Signature/></AEC>`,
    );
    expect(validateAecMeritoEjecutivo(xml)).toEqual({ ok: true });
  });

  it("OK cuando el mérito viene por recibo electrónico (EnvioRecibos)", () => {
    const xml = aec(
      `<AEC><DocumentoAEC><EnvioRecibos>...</EnvioRecibos></DocumentoAEC><Signature/></AEC>`,
    );
    expect(validateAecMeritoEjecutivo(xml)).toEqual({ ok: true });
  });

  it("OK cuando el mérito viene por MnsjRecibo", () => {
    const xml = aec(
      `<AEC><DocumentoAEC><MnsjRecibo>...</MnsjRecibo></DocumentoAEC><Signature/></AEC>`,
    );
    expect(validateAecMeritoEjecutivo(xml)).toEqual({ ok: true });
  });

  it("OK cuando el mérito viene por DeclJurada (legacy)", () => {
    const xml = aec(
      `<AEC><DocumentoAEC><DeclJurada>...</DeclJurada></DocumentoAEC><Signature/></AEC>`,
    );
    expect(validateAecMeritoEjecutivo(xml)).toEqual({ ok: true });
  });

  it("ERROR cuando falta <DocumentoAEC>", () => {
    const xml = aec(`<AEC><Signature/></AEC>`);
    const result = validateAecMeritoEjecutivo(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("DocumentoAEC");
  });

  it("ERROR cuando falta <Signature>", () => {
    const xml = aec(
      `<AEC><DocumentoAEC><DeclaracionJurada>...</DeclaracionJurada></DocumentoAEC></AEC>`,
    );
    const result = validateAecMeritoEjecutivo(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no firmado");
  });

  it("ERROR cuando NO hay declaración jurada NI recibo electrónico", () => {
    const xml = aec(
      `<AEC><DocumentoAEC><Cesiones/></DocumentoAEC><Signature/></AEC>`,
    );
    const result = validateAecMeritoEjecutivo(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Ley 19.983");
  });
});
