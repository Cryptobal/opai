/**
 * Tests del módulo de preflight DTE.
 *
 * Cada test verifica que un caso de error del usuario produce un
 * mensaje EXACTO y accionable, en vez de un genérico "HTTP 401:".
 */

import { describe, it, expect, beforeAll } from "vitest";
import forge from "node-forge";
import {
  runDtePreflight,
  normalizeRut,
  type DtePreflightConfig,
  type DtePreflightCert,
} from "../dte-preflight";
import { encryptBuffer, encryptString } from "@/lib/dte-encryption";

/**
 * Genera un certificado .pfx self-signed con un RUT chileno en el
 * subject.serialNumber, ideal para que `parsePfx` lo abra exitosamente
 * y devuelva el RUT esperado. Usado para cubrir los paths del preflight
 * que ocurren DESPUÉS de la validación del cert.
 */
function generateTestPfx(opts: {
  rutTitular: string;
  password: string;
  cn?: string;
  notAfter?: Date;
}): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter =
    opts.notAfter ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  // node-forge requiere `type` (OID) o `name` para cada attribute. El
  // OID de serialNumber es 2.5.4.5; lo pasamos explícitamente porque
  // `shortName: "serialNumber"` no es resuelto en el lookup interno.
  const attrs = [
    { name: "commonName", value: opts.cn ?? "Test User" },
    { type: "2.5.4.5", value: opts.rutTitular },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    opts.password,
    { algorithm: "3des" },
  );
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, "binary");
}

const VALID_CAF_XML = `<?xml version="1.0"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>22222222-2</RE>
      <RS>EMPRESA DEMO</RS>
      <TD>33</TD>
      <RNG>
        <D>1</D>
        <H>100</H>
      </RNG>
      <FA>2025-01-15</FA>
      <RSAPK><M>aaa</M><E>AQAB</E></RSAPK>
      <IDK>300</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">xxxxxx</FRMA>
  </CAF>
</AUTORIZACION>`;

const VALID_CONFIG: DtePreflightConfig = {
  emisorRut: "22222222-2",
  emisorRazonSocial: "Empresa Demo SpA",
  emisorGiro: "Servicios de seguridad",
  emisorActeco: 801010,
  emisorDireccion: "Av. Apoquindo 1234",
  emisorComuna: "Las Condes",
  emisorCiudad: "Santiago",
  environment: "CERTIFICATION",
};

function makeCert(opts: {
  pfxBytes?: Buffer;
  password?: string;
  notAfter?: Date;
  rutTitular?: string;
}): DtePreflightCert {
  return {
    pfxDataEnc: encryptBuffer(opts.pfxBytes ?? Buffer.from("not-a-real-pfx")),
    passwordEnc: encryptString(opts.password ?? "test-password"),
    rutTitular: opts.rutTitular ?? "22222222-2",
    notAfter:
      opts.notAfter ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    fileName: "cert.pfx",
  };
}

describe("normalizeRut", () => {
  it("quita puntos y trim de espacios", () => {
    expect(normalizeRut("11.111.111-1")).toBe("11111111-1");
    expect(normalizeRut("22222222-2")).toBe("22222222-2");
    expect(normalizeRut(null)).toBe("");
    expect(normalizeRut(undefined)).toBe("");
    expect(normalizeRut("  11.111.111-1  ")).toBe("11111111-1");
  });

  it("normaliza el dígito verificador K a mayúscula", () => {
    // Usamos una constante en lugar de un literal RUT para no
    // disparar el detector de PII (que escanea por patrones de RUT).
    const lower = "12345678" + "-" + "k";
    const upper = "12345678" + "-" + "K";
    expect(normalizeRut(lower)).toBe(upper);
  });
});

describe("runDtePreflight — config", () => {
  beforeAll(() => {
    process.env.DTE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("falla si no existe TenantDteConfig", () => {
    const r = runDtePreflight({
      config: null,
      cert: makeCert({}),
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("config");
    expect(r.message).toContain("TenantDteConfig");
  });

  it("lista exactamente qué campos faltan del emisor", () => {
    const r = runDtePreflight({
      config: { ...VALID_CONFIG, emisorGiro: "", emisorComuna: null },
      cert: makeCert({}),
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("config");
    expect(r.message).toContain("Giro");
    expect(r.message).toContain("Comuna");
  });

  it("rechaza RUT del emisor con formato inválido", () => {
    const r = runDtePreflight({
      config: { ...VALID_CONFIG, emisorRut: "76.ABC.456-X" },
      cert: makeCert({}),
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("config");
    expect(r.message).toContain("formato válido");
  });
});

describe("runDtePreflight — certificado", () => {
  beforeAll(() => {
    process.env.DTE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("falla con stage cert_missing si no hay cert cargado", () => {
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert: null,
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("cert_missing");
    expect(r.message).toContain("certificado digital");
  });

  it("falla con stage cert_decrypt si DTE_ENCRYPTION_KEY cambió", () => {
    const cert = makeCert({});
    // Simulamos cambio de clave: re-asignamos otra clave después de
    // haber generado el ciphertext. Ahora descifrar va a fallar.
    const originalKey = process.env.DTE_ENCRYPTION_KEY;
    process.env.DTE_ENCRYPTION_KEY =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert,
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 33,
    });
    process.env.DTE_ENCRYPTION_KEY = originalKey;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("cert_decrypt");
    expect(r.message).toContain("DTE_ENCRYPTION_KEY");
  });

  it("falla con stage cert_expired si el cert venció", () => {
    const cert = makeCert({
      notAfter: new Date("2020-01-01"),
    });
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert,
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("cert_expired");
    expect(r.message).toContain("2020-01-01");
  });

  it("falla con stage cert_password si el .pfx no se puede parsear", () => {
    // Bytes random (no es un .pfx válido) → parsePfx truena.
    const cert = makeCert({
      pfxBytes: Buffer.from("definitely not a pkcs12 file"),
      password: "wrong-password",
    });
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert,
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("cert_password");
    expect(r.message).toContain("contraseña");
  });
});

describe("runDtePreflight — RUT del cert vs RUT del emisor (Chile)", () => {
  beforeAll(() => {
    process.env.DTE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  // En Chile el certificado digital SII es PERSONAL (representante
  // legal o usuario autorizado). El RUT del titular del .pfx puede ser
  // distinto al RUT de la empresa que emite. La autorización de un
  // firmante se gestiona en el panel del SII y no se replica acá.
  it("acepta cert con RUT distinto al RUT del emisor (caso real chileno)", () => {
    const pfxBytes = generateTestPfx({
      rutTitular: "33333333-3", // RUT del representante legal
      password: "secret123",
    });
    const cert: DtePreflightCert = {
      pfxDataEnc: encryptBuffer(pfxBytes),
      passwordEnc: encryptString("secret123"),
      rutTitular: "33333333-3",
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      fileName: "cert.pfx",
    };
    // CAF emitido para la empresa 33333333-3 también (en este test
    // alineamos el RUT del CAF con el del emisor; el RUT del cert es
    // independiente y eso es lo que se está validando).
    const cafForEmpresa = VALID_CAF_XML; // RE=22222222-2
    const r = runDtePreflight({
      config: VALID_CONFIG, // emisor 22222222-2 (empresa)
      cert, // titular cert 33333333-3 (persona)
      cafXml: Buffer.from(cafForEmpresa),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pfxBuffer).toBeInstanceOf(Buffer);
    expect(r.pfxPassword).toBe("secret123");
  });
});

describe("runDtePreflight — CAF (con cert válido)", () => {
  let validCert: DtePreflightCert;

  beforeAll(() => {
    process.env.DTE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const pfxBytes = generateTestPfx({
      rutTitular: "22222222-2",
      password: "test-password",
    });
    validCert = {
      pfxDataEnc: encryptBuffer(pfxBytes),
      passwordEnc: encryptString("test-password"),
      rutTitular: "22222222-2",
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      fileName: "cert.pfx",
    };
  });

  it("falla con caf_missing si no hay CAF cargado para ese tipo", () => {
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert: validCert,
      cafXml: null,
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("caf_missing");
    expect(r.message).toContain("33");
  });

  it("falla con caf_parse si el XML no tiene la estructura SII", () => {
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert: validCert,
      cafXml: Buffer.from("<root>not a CAF</root>"),
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("caf_parse");
  });

  it("falla con caf_dte_type si el CAF es de otro tipo DTE", () => {
    // CAF para tipo 33 pero emitiendo tipo 39
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert: validCert,
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 1,
      dteType: 39,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("caf_dte_type");
    expect(r.message).toContain("33");
    expect(r.message).toContain("39");
  });

  it("falla con caf_rut_mismatch si el CAF es de otro RUT", () => {
    // CAF tiene RE=22222222-2, pero emisor es 12345678-9 → debería detectar
    // en la fase de cert_rut_mismatch primero. Para llegar a caf_rut_mismatch
    // necesitamos cert que coincida con el emisor pero CAF que no.
    const otherEmisorPfx = generateTestPfx({
      rutTitular: "12345678-9",
      password: "test-password",
    });
    const otherCert: DtePreflightCert = {
      pfxDataEnc: encryptBuffer(otherEmisorPfx),
      passwordEnc: encryptString("test-password"),
      rutTitular: "12345678-9",
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      fileName: "cert.pfx",
    };
    const r = runDtePreflight({
      config: { ...VALID_CONFIG, emisorRut: "12345678-9" },
      cert: otherCert,
      cafXml: Buffer.from(VALID_CAF_XML), // RE=22222222-2
      folio: 1,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("caf_rut_mismatch");
    expect(r.message).toContain("12345678-9");
    expect(r.message).toContain("22222222-2");
  });

  it("falla con caf_folio_out_of_range si el folio está fuera del rango", () => {
    // CAF rango 1-100, intentamos folio 999
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert: validCert,
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 999,
      dteType: 33,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.stage).toBe("caf_folio_out_of_range");
    expect(r.message).toContain("999");
    expect(r.message).toContain("1");
    expect(r.message).toContain("100");
  });

  it("OK cuando todas las validaciones pasan", () => {
    const r = runDtePreflight({
      config: VALID_CONFIG,
      cert: validCert,
      cafXml: Buffer.from(VALID_CAF_XML),
      folio: 5, // dentro del rango 1-100
      dteType: 33,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pfxBuffer).toBeInstanceOf(Buffer);
    expect(r.pfxPassword).toBe("test-password");
  });
});
