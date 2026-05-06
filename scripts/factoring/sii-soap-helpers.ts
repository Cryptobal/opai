/**
 * SII SOAP — tipos compartidos + cliente wsRPETCConsulta.getEstEnvio.
 *
 * Documentación oficial:
 *   - WS Consulta Estado AEC: https://www.sii.cl/factura_electronica/ws_consulta_estado_aec.pdf
 *
 * El flujo de autenticación SOAP (CrSeed → firma → GetTokenFromSeed)
 * vive en `sii-soap-auth.ts`. Este archivo contiene los tipos
 * compartidos (CertMaterial, SiiEnvironment) y la consulta read-only
 * `getEstEnvioAec`.
 *
 * Estos helpers son la fuente de verdad del Bloque 0 (sandbox CLI). Una
 * vez validado contra cert+DTE reales, se promueven a `src/lib/sii/` en
 * el Bloque 9 para uso desde la app (cron).
 */

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
 * de los return values de los servicios SOAP. Reusable por todas las
 * funciones que parsean responses del SII.
 */
export function unescapeSiiInnerXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Re-exports del módulo de auth para mantener una API estable de cara a
// los consumidores del sandbox (cesion-sandbox.ts y cesion-sandbox-soap.ts
// importan todo desde "./sii-soap-helpers").
export {
  extractCertFromPfx,
  getSiiSeed,
  getSiiToken,
  signSeedXml,
} from "./sii-soap-auth";

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
