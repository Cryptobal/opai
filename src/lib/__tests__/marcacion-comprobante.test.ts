import { describe, it, expect } from "vitest";
import {
  formatFechaComprobante,
  formatHoraComprobante,
  formatRutComprobante,
  formatEstablishmentAddress,
  isSha256Hex,
  isValidPersonalEmail,
  normalizePersonalEmail,
} from "@/lib/marcacion-format";
import { computeMarcacionHash, verifyMarcacionHash } from "@/lib/marcacion";
import { buildMarcacionComprobanteHtml } from "@/lib/marcacion-email";
import { buildMarcacionRes38Snapshot } from "@/lib/marcacion-res38-snapshot";

describe("formatFechaComprobante / formatHoraComprobante", () => {
  it("formatea dd/mm/aa y HH:mm:ss en America/Santiago", () => {
    // 2026-03-15 15:04:05 UTC = 12:04:05 Chile (marzo, UTC-3)
    const d = new Date("2026-03-15T15:04:05.000Z");
    expect(formatFechaComprobante(d)).toBe("15/03/26");
    expect(formatHoraComprobante(d)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatHoraComprobante(d)).toBe("12:04:05");
  });
});

describe("formatRutComprobante", () => {
  it("formatea con puntos y guión", () => {
    expect(formatRutComprobante("123456785")).toBe("12.345.678-5");
    expect(formatRutComprobante("12.345.678-5")).toBe("12.345.678-5");
  });
});

describe("formatEstablishmentAddress", () => {
  it("concatena calle, comuna, ciudad y región", () => {
    expect(
      formatEstablishmentAddress({
        address: "Av. Apoquindo 123",
        commune: "Las Condes",
        city: "Santiago",
        region: "Metropolitana",
      }),
    ).toBe("Av. Apoquindo 123, Las Condes, Santiago, Metropolitana");
  });
});

describe("computeMarcacionHash / verifyMarcacionHash", () => {
  const base = {
    guardiaId: "g1",
    installationId: "i1",
    tipo: "entrada",
    timestamp: "2026-03-15T15:04:05.000Z",
    lat: null as number | null,
    lng: null as number | null,
    metodoId: "rut_pin",
    tenantId: "t1",
  };

  it("es determinista e incluye null GPS", () => {
    const a = computeMarcacionHash(base);
    const b = computeMarcacionHash({ ...base });
    expect(a).toBe(b);
    expect(isSha256Hex(a)).toBe(true);
  });

  it("verifyMarcacionHash confirma integridad", () => {
    const hash = computeMarcacionHash(base);
    const result = verifyMarcacionHash({
      ...base,
      timestamp: new Date(base.timestamp),
      hashIntegridad: hash,
    });
    expect(result.isValid).toBe(true);
    expect(result.expectedHash).toBe(hash);
  });

  it("detecta alteración de timestamp", () => {
    const hash = computeMarcacionHash(base);
    const result = verifyMarcacionHash({
      ...base,
      timestamp: new Date("2026-03-15T16:00:00.000Z"),
      hashIntegridad: hash,
    });
    expect(result.isValid).toBe(false);
  });
});

describe("buildMarcacionComprobanteHtml Art. 13", () => {
  it("incluye campos obligatorios, dd/mm/aa y enlace de verificación", () => {
    const { subject, html } = buildMarcacionComprobanteHtml({
      guardiaName: "Ana Pérez",
      guardiaEmail: "ana@example.com",
      guardiaRut: "123456785",
      installationName: "Mall Centro",
      tipo: "entrada",
      timestamp: new Date("2026-03-15T15:04:05.000Z"),
      geoValidada: true,
      geoDistanciaM: 12,
      gpsStatus: "dentro_rango",
      hashIntegridad: "a".repeat(64),
      lat: -33.4,
      lng: -70.6,
      employerName: "Gard Security SpA",
      employerRut: "76.123.456-0",
      establishmentAddress: "Av. Apoquindo 123, Las Condes, Santiago, Metropolitana",
      dtResolutionNumber: "RE-38-2024",
      dtResolutionDate: new Date("2026-12-31T00:00:00.000Z"),
      mandanteName: "Cliente SpA",
      mandanteRut: "11.111.111-1",
      verifyUrl: "https://www.opai.cl/verificar/" + "a".repeat(64),
    });
    expect(subject).toContain("Entrada");
    expect(html).toContain("15/03/26");
    expect(html).toContain("12:04:05");
    expect(html).toContain("12.345.678-5");
    expect(html).toContain("Gard Security SpA");
    expect(html).toContain("Av. Apoquindo 123");
    expect(html).toContain("RE-38-2024");
    expect(html).toContain("Mandante");
    expect(html).toContain("Verificar comprobante");
    expect(html).toContain("@media print");
  });
});

describe("buildMarcacionRes38Snapshot", () => {
  it("arma mandante desde la cuenta CRM", () => {
    const snap = buildMarcacionRes38Snapshot({
      employerRut: "761234560",
      employerName: "Gard Security SpA",
      installation: {
        address: "Calle 1",
        commune: "Santiago",
        city: "Santiago",
        region: "RM",
        account: { name: "Cliente", legalName: "Cliente SpA", rut: "111111111" },
      },
      dtResolucionJornada: "RE-1",
      dtResolucionVigencia: new Date("2027-01-01"),
    });
    expect(snap.mandanteName).toBe("Cliente SpA");
    expect(snap.establishmentAddress).toContain("RM");
    expect(snap.dtResolutionNumber).toBe("RE-1");
  });
});

describe("email helpers", () => {
  it("valida y normaliza correo personal", () => {
    expect(isValidPersonalEmail("ana@example.com")).toBe(true);
    expect(isValidPersonalEmail("no")).toBe(false);
    expect(normalizePersonalEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("rechaza hashes que no son SHA-256 hex", () => {
    expect(isSha256Hex("abc")).toBe(false);
    expect(isSha256Hex("A".repeat(64))).toBe(true);
  });
});
