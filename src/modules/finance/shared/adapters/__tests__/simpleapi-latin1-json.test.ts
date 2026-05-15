/**
 * El multipart `input` de SimpleAPI va como JSON con bytes Latin-1.
 * Caracteres fuera de ISO-8859-1 deben normalizarse antes de codificar;
 * si no, el JSON queda sintácticamente inválido y SimpleAPI responde 400.
 */

import { describe, expect, it } from "vitest";
import {
  buildMultipartBody,
  sanitizeJsonStringForSimpleApiLatin1,
} from "../simpleapi-http";

describe("sanitizeJsonStringForSimpleApiLatin1", () => {
  it("reemplaza em dash tipográfico para que el JSON siga parseable en Latin-1", () => {
    const raw = JSON.stringify({
      Nombre: "Servicios mensuales seguridad — Abril 2026",
    });
    // Sin sanitizer, Latin-1 corrompe y JSON.parse falla (control char).
    expect(() => JSON.parse(Buffer.from(raw, "latin1").toString("latin1"))).toThrow();

    const safe = sanitizeJsonStringForSimpleApiLatin1(raw);
    const roundtrip = Buffer.from(safe, "latin1").toString("latin1");
    expect(JSON.parse(roundtrip)).toEqual({
      Nombre: "Servicios mensuales seguridad - Abril 2026",
    });
  });

  it("preserva letras con tilde en Latin-1 (español/portugués)", () => {
    const raw = JSON.stringify({ Glosa: "Código ação são José ñ" });
    const safe = sanitizeJsonStringForSimpleApiLatin1(raw);
    expect(JSON.parse(Buffer.from(safe, "latin1").toString("latin1"))).toEqual({
      Glosa: "Código ação são José ñ",
    });
  });
});

describe("buildMultipartBody + Latin-1", () => {
  it("incluye JSON válido en la parte input después de codificar", () => {
    const json = JSON.stringify({ X: "—" });
    const { body } = buildMultipartBody([{ name: "input", content: json }]);
    const s = body.toString("latin1");
    const m = s.match(/Content-Type: application\/json; charset=ISO-8859-1\r\n\r\n/);
    expect(m).toBeTruthy();
    const afterHeaders = s.split("\r\n\r\n", 2)[1];
    const jsonPart = afterHeaders?.split("\r\n--")[0] ?? "";
    expect(() => JSON.parse(jsonPart)).not.toThrow();
    expect(JSON.parse(jsonPart)).toEqual({ X: "-" });
  });
});
