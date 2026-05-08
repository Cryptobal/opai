/**
 * SII SOAP — auth + wsRPETCConsulta client.
 *
 * Promovido al app desde `scripts/factoring/{sii-soap-helpers, sii-soap-auth}.ts`
 * tras validación al 100% contra producción (TrackId 11998878336 → EOK
 * confirmado por SII el 06/05/2026, ver Bloque 0 del módulo de cesiones).
 *
 * Documentación oficial:
 *   - Autenticación Automática: https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf
 *   - WS Consulta Estado AEC:   https://www.sii.cl/factura_electronica/ws_consulta_estado_aec.pdf
 *
 * Flujo:
 *   1. POST {host}/DTEWS/CrSeed.jws            → obtiene <SEMILLA>
 *   2. signSeedXml(seed, cert)                 → genera <getToken> firmado (XMLDSig C14N)
 *   3. POST {host}/DTEWS/GetTokenFromSeed.jws  → obtiene <TOKEN>
 *   4. POST {host}/DTEWS/services/wsRPETCConsulta → SOAP getEstEnvio
 */

import { createSign } from "node:crypto";
import { spawnSync } from "child_process";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import * as forge from "node-forge";

export type SiiEnvironment = "CERTIFICATION" | "PRODUCTION";

export const HOSTS: Record<SiiEnvironment, string> = {
  CERTIFICATION: "https://maullin.sii.cl",
  PRODUCTION: "https://palena.sii.cl",
};

export interface CertMaterial {
  privateKeyPem: string;
  certificatePem: string;
  /** X.509 cert sin headers BEGIN/END, todo en una línea (para X509Certificate). */
  certBase64: string;
  /** Public key RSA (modulus + exponent) para incluir en KeyValue/RSAKeyValue. */
  publicKey: forge.pki.rsa.PublicKey;
}

/**
 * Des-escapa el XML interno que el SII anida (doble-escapado) dentro
 * de los return values de los servicios SOAP.
 */
function unescapeSiiInnerXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Extrae llave privada y certificado X.509 desde un buffer .pfx.
 * Compatible con certs digitales chilenos (RFC 3280).
 */
export function extractCertFromPfx(
  pfxBuffer: Buffer,
  password: string,
): CertMaterial {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  let privateKey: forge.pki.PrivateKey | null = null;
  let certificate: forge.pki.Certificate | null = null;

  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (
        safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
        safeBag.type === forge.pki.oids.keyBag
      ) {
        privateKey = safeBag.key ?? null;
      } else if (safeBag.type === forge.pki.oids.certBag) {
        certificate = safeBag.cert ?? null;
      }
    }
  }
  if (!privateKey || !certificate) {
    throw new Error("PFX no contiene cert o privateKey válidos");
  }
  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const certificatePem = forge.pki.certificateToPem(certificate);
  const certBase64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s/g, "");
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  return { privateKeyPem, certificatePem, certBase64, publicKey };
}

/**
 * Versión de extractCertFromPfx con fallback a Python/cryptography para
 * PFX legacy (RC2/3DES) comunes en certificados SII chilenos que node-forge
 * no puede leer.
 */
export function extractCertFromPfxWithFallback(
  pfxBuffer: Buffer,
  password: string,
): CertMaterial {
  try {
    return extractCertFromPfx(pfxBuffer, password);
  } catch {
    // node-forge no puede leer el PFX (probablemente legacy RC2/3DES).
    // Usar pfx_extract.py que usa cryptography de Python.
    const scriptPath = path.join(__dirname, "pfx_extract.py");
    const pfxB64 = pfxBuffer.toString("base64");
    const result = spawnSync(
      "python3",
      [scriptPath, "--pfx", pfxB64, "--password", password],
      { maxBuffer: 2 * 1024 * 1024, timeout: 15_000 },
    );
    if (result.status !== 0) {
      const stderr = result.stderr?.toString("utf8") ?? "";
      throw new Error(
        `pfx_extract.py falló (code ${result.status}): ${stderr.slice(0, 300)}`,
      );
    }
    const { privateKeyPem, certificatePem } = JSON.parse(
      result.stdout.toString("utf8"),
    ) as { privateKeyPem: string; certificatePem: string };

    const certBase64 = certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/, "")
      .replace(/-----END CERTIFICATE-----/, "")
      .replace(/\s/g, "");

    // Necesitamos el publicKey para signSeedXml — cargar desde PEM con forge
    const forgeCert = forge.pki.certificateFromPem(certificatePem);
    const publicKey = forgeCert.publicKey as forge.pki.rsa.PublicKey;
    return { privateKeyPem, certificatePem, certBase64, publicKey };
  }
}

/** Paso 1: pedir semilla al SII. */
export async function getSiiSeed(env: SiiEnvironment): Promise<string> {
  const host = HOSTS[env];
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body><def:getSeed/></soapenv:Body>
</soapenv:Envelope>`;
  const r = await fetch(`${host}/DTEWS/CrSeed.jws`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: soapBody,
  });
  if (!r.ok) {
    throw new Error(`CrSeed HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  }
  const inner = unescapeSiiInnerXml(await r.text());
  const match = inner.match(/<SEMILLA>(\d+)<\/SEMILLA>/);
  if (!match) throw new Error(`CrSeed sin <SEMILLA>: ${inner.slice(0, 500)}`);
  return match[1];
}

function bigIntToBase64(big: forge.jsbn.BigInteger): string {
  let hex = big.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  return forge.util.encode64(forge.util.hexToBytes(hex));
}

/**
 * Paso 2: firmar el XML del getToken con XMLDSig C14N + cert digital.
 * IMPORTANTE: SignedInfo va en forma canónica (sin self-closing tags) para
 * que los bytes firmados coincidan con los que el SII canonicaliza al
 * verificar. Ver bloque 0 (commit ff08ad53b) por la historia del fix.
 * Defensa: incluye KeyValue/RSAKeyValue además de X509Certificate.
 */
export function signSeedXml(seed: string, cert: CertMaterial): string {
  const xmlToSign = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  const digestSha1 = forge.md.sha1.create();
  digestSha1.update(xmlToSign, "utf8");
  const digestB64 = forge.util.encode64(digestSha1.digest().bytes());

  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digestB64}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const sign = createSign("RSA-SHA1");
  sign.update(signedInfo);
  sign.end();
  const signatureValue = sign.sign(cert.privateKeyPem, "base64");

  const modulusB64 = bigIntToBase64(cert.publicKey.n);
  const exponentB64 = bigIntToBase64(cert.publicKey.e);
  const keyInfo =
    `<KeyInfo>` +
    `<KeyValue><RSAKeyValue><Modulus>${modulusB64}</Modulus><Exponent>${exponentB64}</Exponent></RSAKeyValue></KeyValue>` +
    `<X509Data><X509Certificate>${cert.certBase64}</X509Certificate></X509Data>` +
    `</KeyInfo>`;

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    keyInfo +
    `</Signature>`;
  return `<getToken><item><Semilla>${seed}</Semilla></item>${signature}</getToken>`;
}

/** Paso 3: enviar XML firmado y obtener token. */
export async function getSiiToken(
  env: SiiEnvironment,
  signedXml: string,
): Promise<string> {
  const host = HOSTS[env];
  const escapedXml = signedXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body><def:getToken><pszXml>${escapedXml}</pszXml></def:getToken></soapenv:Body>
</soapenv:Envelope>`;
  const r = await fetch(`${host}/DTEWS/GetTokenFromSeed.jws`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: soapBody,
  });
  if (!r.ok) {
    throw new Error(
      `GetTokenFromSeed HTTP ${r.status}: ${(await r.text()).slice(0, 800)}`,
    );
  }
  const inner = unescapeSiiInnerXml(await r.text());
  const match = inner.match(/<TOKEN>([\w-]+)<\/TOKEN>/);
  if (!match) throw new Error(`GetTokenFromSeed sin TOKEN: ${inner.slice(0, 800)}`);
  return match[1];
}

/** Resultado parseado de wsRPETCConsulta.getEstEnvio. */
export interface EstEnvioResult {
  ok: boolean;
  estado: string;
  estadoEnvio?: string;
  descEstado?: string;
  trackId?: string;
  glosa?: string;
  rawXml: string;
}

interface RespuestaShape {
  RESPUESTA?: {
    RESP_HDR?: { ESTADO?: string | number; GLOSA?: string };
    RESP_BODY?: {
      TRACKID?: string | number;
      ESTADO_ENVIO?: string;
      DESC_ESTADO?: string;
    };
  };
}

/** Consulta estado de envío AEC en RPETC. */
export async function getEstEnvioAec(
  env: SiiEnvironment,
  token: string,
  trackId: string,
): Promise<EstEnvioResult> {
  const host = HOSTS[env];
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body>
    <def:getEstEnvio>
      <Token>${token}</Token>
      <TrackId>${trackId}</TrackId>
    </def:getEstEnvio>
  </soapenv:Body>
</soapenv:Envelope>`;
  const r = await fetch(`${host}/DTEWS/services/wsRPETCConsulta`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: soapBody,
  });
  const responseText = await r.text();
  if (!r.ok) {
    return {
      ok: false,
      estado: "HTTP",
      glosa: `HTTP ${r.status}`,
      rawXml: responseText,
    };
  }
  const inner = unescapeSiiInnerXml(responseText);
  const respMatch = inner.match(
    /<(?:SII:)?RESPUESTA[^>]*>[\s\S]*?<\/(?:SII:)?RESPUESTA>/,
  );
  if (!respMatch) {
    return {
      ok: false,
      estado: "PARSE",
      glosa: "RESPUESTA no encontrada en el response SOAP",
      rawXml: responseText,
    };
  }
  let parsed: RespuestaShape;
  try {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    parsed = parser.parse(respMatch[0]) as RespuestaShape;
  } catch (err) {
    return {
      ok: false,
      estado: "PARSE",
      glosa: (err as Error).message,
      rawXml: responseText,
    };
  }
  const hdr = parsed.RESPUESTA?.RESP_HDR ?? {};
  const body = parsed.RESPUESTA?.RESP_BODY ?? {};
  const estado = hdr.ESTADO !== undefined ? String(hdr.ESTADO) : "";
  return {
    ok: estado === "0",
    estado,
    glosa: hdr.GLOSA,
    estadoEnvio: body.ESTADO_ENVIO,
    descEstado: body.DESC_ESTADO,
    trackId: body.TRACKID !== undefined ? String(body.TRACKID) : undefined,
    rawXml: responseText,
  };
}
