/**
 * SII RTC AEC sender.
 *
 * Envía un AEC firmado (output de `aec-signer.ts`) al endpoint del
 * Registro Público Electrónico de Transferencia de Crédito (RPETC) del
 * SII vía `RTCAnotEnvio.cgi`. NO depende de SimpleAPI: el cert digital
 * del tenant ya nos firmó el AEC y nosotros mismos hablamos con el SII.
 *
 * Endpoints:
 *   - Cert: https://maullin.sii.cl/cgi_rtc/RTC/RTCAnotEnvio.cgi
 *   - Prod: https://palena.sii.cl/cgi_rtc/RTC/RTCAnotEnvio.cgi
 *
 * Documentación oficial:
 *   https://www.sii.cl/factura_electronica/envio_automatico_aec.pdf
 *
 * Multipart fields (capítulo 2.2 del PDF):
 *   - emailNotif : correo de notificación (string)
 *   - rutCompany : RUT empresa cedente SIN DV ni puntos (e.g. "77840623")
 *   - dvCompany  : DV (e.g. "3" o "K")
 *   - archivo    : XML AEC firmado, content-type text/xml
 *
 * Header obligatorio: `Cookie: TOKEN=<token-soap-del-sii>`
 *   El token se obtiene previamente vía `getOrCreateSiiToken()` de
 *   `src/modules/finance/factoring/sii-soap.service.ts` (mismo cache
 *   ya validado en producción para wsRPETCConsulta).
 *
 * Respuesta esperada (capítulo 3.2 — pattern equivalente a RECEPCIONDTE):
 *
 *   <RECEPCIONAEC>            <-- el wrapper varía; el parser es laxo
 *     <RUTSENDER>...</RUTSENDER>
 *     <RUTCOMPANY>...</RUTCOMPANY>
 *     <FILE>...</FILE>
 *     <TIMESTAMP>YYYY-MM-DD HH:MM:SS</TIMESTAMP>
 *     <STATUS>0</STATUS>      <-- 0 = OK, 1..13 = errores (ver PDF cap 3.2)
 *     <TRACKID>123456</TRACKID>
 *   </RECEPCIONAEC>
 *
 * El parser usa regex laxo (no asume nombre del wrapper) porque la doc
 * no especifica con precisión y otros endpoints similares del SII
 * varían (RECEPCIONDTE, RPETC_AEC, etc.). Capturamos lo que esté.
 */

import { splitRut } from "./aec-builder";
import { HOSTS, type SiiEnvironment } from "./soap-client";

/** Path absoluto del CGI dentro del host del SII. */
const RTC_PATH = "/cgi_rtc/RTC/RTCAnotEnvio.cgi" as const;

/** Input estructurado del sender. */
export interface SendAecInput {
  /** Ambiente SII (cert vs prod). Determina el host. */
  env: SiiEnvironment;
  /**
   * Token SOAP del SII (se inyecta en el header `Cookie: TOKEN=...`).
   * Se obtiene con `getOrCreateSiiToken()` (8 min TTL en cache).
   */
  token: string;
  /**
   * AEC firmado. El XML lleva `<?xml version="1.0" encoding="ISO-8859-1"?>`,
   * por eso lo manejamos como Buffer (los string JS son UTF-16 y
   * convertir corrompe los bytes — usar `Buffer.from(xml, "latin1")`
   * en el caller).
   */
  aecXml: Buffer;
  /**
   * RUT del cedente formateado "NNNNNNNN-D" (con guion). Se splitea
   * en cuerpo + DV internamente para mandar `rutCompany` y `dvCompany`
   * por separado (lo exige el endpoint RTCAnotEnvio).
   */
  rutCedente: string;
  /** Email donde el SII notifica al cedente. */
  emailNotif: string;
  /** Filename del campo `archivo`. Default `AEC_<timestamp>.xml`. */
  fileName?: string;
}

/** Output estructurado tras parsear la respuesta del SII. */
export interface SendAecResult {
  /** true cuando STATUS === "0" (recibido OK por el SII). */
  ok: boolean;
  /** TrackId asignado por el SII (cuando ok=true). */
  trackId?: string;
  /** STATUS del SII (string). "0"=OK, "1".."13"=errores. */
  status?: string;
  /** Mensaje legible (GLOSA si vino, "HTTP <n>" si fallo de transporte). */
  glosa?: string;
  /** RUT del sender (titular del cert) reportado por el SII. */
  rutSender?: string;
  /** RUT de la company (cedente) reportado por el SII. */
  rutCompany?: string;
  /** Filename echo del SII. */
  fileName?: string;
  /** Timestamp del SII (string como vino). */
  timestamp?: string;
  /** Body completo de la respuesta (texto). Siempre presente para auditoría. */
  rawXml: string;
  /** HTTP status de la respuesta. 0 si la fetch lanzó antes de tener respuesta. */
  httpStatus: number;
}

/** Extrae el contenido de un tag XML por nombre (case-sensitive, sin namespaces). */
function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1]?.trim();
}

/**
 * Construye un `Blob` con encoding text/xml a partir del Buffer del AEC.
 * En Node 20+, `Blob` y `FormData` son globals — no necesitamos `form-data`.
 */
function aecBlob(aecXml: Buffer): Blob {
  // `Blob` global acepta Uint8Array (Buffer es subclase de Uint8Array).
  return new Blob([aecXml], { type: "text/xml" });
}

/**
 * POSTea el AEC al RPETC del SII y parsea la respuesta.
 *
 * NUNCA throwea por errores del SII (status != 0, HTTP != 200, etc.):
 * siempre devuelve un `SendAecResult` estructurado para que el adapter
 * pueda mapearlo a `DteCedeResponse` con un mensaje claro.
 *
 * Solo throwea por errores de programación (input inválido a
 * `splitRut`, etc.).
 */
export async function sendAecToSii(input: SendAecInput): Promise<SendAecResult> {
  const url = `${HOSTS[input.env]}${RTC_PATH}`;
  const { cuerpo, dv } = splitRut(input.rutCedente);
  const fileName =
    input.fileName ??
    `AEC_${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}.xml`;

  const form = new FormData();
  form.append("emailNotif", input.emailNotif);
  form.append("rutCompany", cuerpo);
  form.append("dvCompany", dv);
  form.append("archivo", aecBlob(input.aecXml), fileName);

  let httpStatus = 0;
  let bodyText = "";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        // El SII exige que el token vaya en cookie. NO usar Authorization:
        // el endpoint es legacy CGI y solo lee la cookie TOKEN.
        Cookie: `TOKEN=${input.token}`,
      },
      body: form,
    });
    httpStatus = r.status;
    bodyText = await r.text();
  } catch (err) {
    // Error de transporte (DNS, timeout, TLS). Devolver estructura clara.
    return {
      ok: false,
      glosa: `Network error: ${(err as Error).message}`,
      rawXml: "",
      httpStatus: 0,
    };
  }

  // RTCAnotEnvio.cgi siempre responde con HTML (no XML).
  // El "Identificador de envío" en el HTML ES el TrackId del RPETC.
  // Ejemplo: <font face="Arial" size="2"><b> 12006780850</b></font>
  // Lo buscamos cerca del texto "Identificador de env".
  //
  // Si en cambio la respuesta es XML (RECEPCIONAEC con STATUS/TRACKID),
  // usamos el parser laxo original como fallback.
  // El SII devuelve la tilde como HTML entity: "env&iacute;o"
  const htmlTrackIdMatch = bodyText.match(
    /Identificador\s+de\s+env(?:[íi]|&iacute;)o\s*:[\s\S]*?<b>\s*(\d+)\s*<\/b>/i,
  );
  const htmlTrackId = htmlTrackIdMatch?.[1];

  // Si contiene el patrón HTML del comprobante SII → ok=true
  const isHtmlComprobante =
    htmlTrackId !== undefined &&
    bodyText.includes("Registro P") &&
    (bodyText.includes("Transferencias") || bodyText.includes("Cesión"));

  if (isHtmlComprobante) {
    // Extraer timestamp del HTML: "08-05-2026</b>, a las <b>00:55:56"
    const tsMatch = bodyText.match(
      /recibido con fecha\s*<b>([\d-]+)<\/b>,\s*a las\s*<b>([\d:]+)<\/b>/i,
    );
    const timestamp = tsMatch ? `${tsMatch[1]} ${tsMatch[2]}` : undefined;

    return {
      ok: true,
      trackId: htmlTrackId,
      status: "0",
      glosa: undefined,
      rutSender: undefined,
      rutCompany: undefined,
      fileName: fileName,
      timestamp,
      rawXml: bodyText,
      httpStatus,
    };
  }

  // Fallback: intentar parsear como XML (RECEPCIONAEC con STATUS/TRACKID).
  const status = extractTag(bodyText, "STATUS");
  const trackId = extractTag(bodyText, "TRACKID");
  const glosaTag = extractTag(bodyText, "GLOSA");
  const rutSender = extractTag(bodyText, "RUTSENDER");
  const rutCompany = extractTag(bodyText, "RUTCOMPANY");
  const fileEcho = extractTag(bodyText, "FILE");
  const timestamp = extractTag(bodyText, "TIMESTAMP");

  const isOk = status === "0";

  let glosa = glosaTag;
  if (!glosa && httpStatus >= 400) {
    glosa = `HTTP ${httpStatus}`;
  }
  if (!glosa && !status && bodyText.length > 0) {
    glosa = `Respuesta SII no parseable (head): ${bodyText.slice(0, 200)}`;
  }

  return {
    ok: isOk,
    trackId,
    status,
    glosa,
    rutSender,
    rutCompany,
    fileName: fileEcho ?? fileName,
    timestamp,
    rawXml: bodyText,
    httpStatus,
  };
}
