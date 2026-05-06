/**
 * SII SOAP auth flow + wsRPETCConsulta client (sandbox helpers).
 *
 * Documentación oficial:
 *   - Autenticación Automática: https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf
 *   - WS Consulta Estado AEC:   https://www.sii.cl/factura_electronica/ws_consulta_estado_aec.pdf
 *
 * Flujo:
 *   1. POST {host}/DTEWS/CrSeed.jws → obtiene <SEMILLA>
 *   2. Firmar XML <getToken><item><Semilla>...</Semilla></item></getToken>
 *      con XMLDSig + cert digital
 *   3. POST {host}/DTEWS/GetTokenFromSeed.jws → obtiene <TOKEN>
 *   4. POST {host}/DTEWS/services/wsRPETCConsulta → SOAP getEstEnvio
 *
 * Estos helpers son la fuente de verdad del Bloque 0 (sandbox CLI). Una
 * vez validado contra cert+DTE reales, se promueven a `src/lib/sii/` en
 * el Bloque 9 para uso desde la app (cron).
 */

import { createSign } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import * as forge from "node-forge";

export type SiiEnvironment = "CERTIFICATION" | "PRODUCTION";

const HOSTS: Record<SiiEnvironment, string> = {
  CERTIFICATION: "https://maullin.sii.cl",
  PRODUCTION: "https://palena.sii.cl",
};

export interface CertMaterial {
  privateKeyPem: string;
  certificatePem: string;
  /** X.509 cert sin headers BEGIN/END, todo en una línea (para X509Certificate). */
  certBase64: string;
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
  return { privateKeyPem, certificatePem, certBase64 };
}

/**
 * Paso 1: pedir semilla al SII.
 */
export async function getSiiSeed(env: SiiEnvironment): Promise<string> {
  const host = HOSTS[env];
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body><def:getSeed/></soapenv:Body>
</soapenv:Envelope>`;

  const r = await fetch(`${host}/DTEWS/CrSeed.jws`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    body: soapBody,
  });
  if (!r.ok) {
    throw new Error(`CrSeed HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  }
  const text = await r.text();
  const match = text.match(/<SEMILLA>(\d+)<\/SEMILLA>/);
  if (!match) throw new Error(`CrSeed sin <SEMILLA>: ${text.slice(0, 500)}`);
  return match[1];
}

/**
 * Paso 2: firmar XML <getToken><item><Semilla>X</Semilla></item></getToken>
 * con XMLDSig (enveloped signature) usando el cert digital.
 *
 * Nota: para este XML simple (canónico C14N sin transformaciones extra),
 * el documento ya está canonicalizado, por lo que evitamos depender de
 * una librería C14N externa. Si en el futuro se firma XML más complejo
 * con namespaces/atributos no triviales, agregar canonicalización real.
 */
export function signSeedXml(seed: string, cert: CertMaterial): string {
  const xmlToSign = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;

  const digestSha1 = forge.md.sha1.create();
  digestSha1.update(xmlToSign, "utf8");
  const digestB64 = forge.util.encode64(digestSha1.digest().bytes());

  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="">` +
    `<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digestB64}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const sign = createSign("RSA-SHA1");
  sign.update(signedInfo);
  sign.end();
  const signatureValue = sign.sign(cert.privateKeyPem, "base64");

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${cert.certBase64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  return `<getToken><item><Semilla>${seed}</Semilla></item>${signature}</getToken>`;
}

/**
 * Paso 3: enviar XML firmado y obtener token.
 * El SII espera el XML firmado escapado dentro de <pszXml>.
 */
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
  <soapenv:Body>
    <def:getToken>
      <pszXml>${escapedXml}</pszXml>
    </def:getToken>
  </soapenv:Body>
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
  const text = await r.text();
  const match = text.match(/<TOKEN>([\w-]+)<\/TOKEN>/);
  if (!match) throw new Error(`GetTokenFromSeed sin TOKEN: ${text.slice(0, 800)}`);
  return match[1];
}

/**
 * Resultado parseado de wsRPETCConsulta.getEstEnvio.
 * - estado === "0" significa header OK; el estado real del envío está en estadoEnvio.
 * - estado distinto de "0" significa error a nivel de header (token inválido,
 *   trackid no encontrado, etc.) — la glosa explica.
 */
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

/**
 * Consulta estado de envío AEC en RPETC.
 */
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

  // El XML interno con <SII:RESPUESTA> viene doble-escapado dentro de la
  // envoltura SOAP <getEstEnvioReturn>. Lo des-escapamos antes de parsear.
  const inner = responseText
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

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
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
    });
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
