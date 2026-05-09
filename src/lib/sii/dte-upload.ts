/**
 * Upload directo de un sobre EnvioDTE al SII vía `cgi_dte/UPL/DTEUpload`.
 *
 * Usado como bypass cuando SimpleAPI `envio/enviar` falla por su cache de
 * token interno (responde "TOKEN INACTIVO 002" / "no autenticado STATUS 5"
 * aunque la cert siga válida). Esta ruta usa nuestro propio token SII
 * obtenido vía CrSeed → signSeed → GetTokenFromSeed (mismo flujo que ya
 * usamos para cesión). NO depende de SimpleAPI.
 *
 * Endpoint:
 *   - CERTIFICATION: https://maullin.sii.cl/cgi_dte/UPL/DTEUpload
 *   - PRODUCTION:    https://palena.sii.cl/cgi_dte/UPL/DTEUpload
 *
 * Multipart form (text fields):
 *   rutSender, dvSender       — cert holder (rutTitular)
 *   rutCompany, dvCompany     — emisor RUT
 *   file                      — sobre XML (upload.xml, ISO-8859-1)
 *
 * Headers:
 *   Cookie: TOKEN={token}     — del getSiiToken
 *   User-Agent / Referer      — el SII no acepta libcurl, requiere UA "browser-like"
 *
 * Response (parseable XML):
 *   <RECEPCIONDTE>
 *     <STATUS>0</STATUS>
 *     <TRACKID>nnn</TRACKID>
 *   </RECEPCIONDTE>
 *
 * STATUS distinto de "0" es error (mapeo en STATUS_DESC abajo).
 */

import {
  HOSTS,
  type CertMaterial,
  type SiiEnvironment,
  extractCertFromPfxWithFallback,
  getSiiSeed,
  signSeedXml,
  getSiiToken,
} from "./soap-client";

const UPLOAD_PATH = "/cgi_dte/UPL/DTEUpload" as const;

/**
 * Mensajes oficiales SII para cada STATUS de RECEPCIONDTE. Mantenido en
 * el mismo orden que documentación oficial (Sii Manual de Envíos).
 */
export const SII_UPLOAD_STATUS: Record<string, string> = {
  "0": "OK",
  "1": "El Sender no tiene permiso para enviar",
  "2": "Error en tamaño del archivo (muy grande o muy chico)",
  "3": "Archivo cortado (tamaño <> al parámetro size)",
  "5": "No está autenticado",
  "6": "Empresa no autorizada a enviar archivos",
  "7": "Esquema Invalido",
  "8": "Firma del Documento",
  "9": "Sistema Bloqueado",
  "99": "Error Interno",
};

export interface DteUploadInput {
  /** XML del sobre EnvioDTE (typ. devuelto por SimpleAPI envio/generar). */
  sobreXml: Buffer;
  /** Material del cert digital ya extraído del .pfx. */
  cert: CertMaterial;
  /** RUT del titular del cert (cert holder), formato 12345678-9. */
  rutTitular: string;
  /** RUT de la empresa emisora del DTE, formato 12345678-9. */
  rutEmisor: string;
  /** Ambiente SII. */
  environment: SiiEnvironment;
  /** Token reutilizable. Si no viene, se obtiene uno nuevo. */
  token?: string;
}

export interface DteUploadResult {
  /** SII trackId (entero positivo) cuando STATUS=0, sino null. */
  trackId: string | null;
  /** STATUS textual del SII (ej. "0", "5", "99"). */
  status: string;
  /** Glosa humano-legible del status. */
  statusDescription: string;
  /** XML crudo de respuesta SII (debug). */
  rawXml: string;
  /** Token SII usado (útil para reusar en consultas posteriores). */
  token: string;
}

/**
 * Sube un sobre EnvioDTE firmado al SII directamente, usando un token
 * fresco obtenido de CrSeed/GetTokenFromSeed. Devuelve el trackId
 * cuando STATUS=0; cuando hay error, `trackId=null` y la glosa
 * descriptiva en `statusDescription`.
 *
 * NO firma el sobre (asume que viene firmado). NO valida el cert
 * (usa lo que se pase). Pensado para llamarse desde el provider DTE
 * después de que SimpleAPI haya generado y firmado el sobre.
 */
export async function uploadEnvioDteToSii(
  input: DteUploadInput,
): Promise<DteUploadResult> {
  const host = HOSTS[input.environment];
  const url = `${host}${UPLOAD_PATH}`;

  const token =
    input.token ??
    (await fetchFreshToken(input.cert, input.environment));

  const [rutSender, dvSender] = splitRut(input.rutTitular);
  const [rutCompany, dvCompany] = splitRut(input.rutEmisor);

  const form = new FormData();
  form.append("rutSender", rutSender);
  form.append("dvSender", dvSender);
  form.append("rutCompany", rutCompany);
  form.append("dvCompany", dvCompany);
  form.append(
    "file",
    new Blob([new Uint8Array(input.sobreXml)], {
      type: "text/xml; charset=ISO-8859-1",
    }),
    "envio.xml",
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Cookie: `TOKEN=${token}`,
      // SII responde "STATUS 99 Error Interno" (HTML, no XML) si el
      // User-Agent o Referer no cumplen el patrón legacy que su CGI
      // espera. Estos valores son los probados (mismo patrón que
      // SimpleSDK y python-sii). NO cambiar sin probar contra
      // palena.sii.cl real.
      "User-Agent":
        "Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)",
      Referer: `${host}/cgi_dte/UPL/DTEauth?1`,
      Accept: "application/xml, text/xml, */*",
    },
    body: form,
  });

  const rawXml = await res.text();
  if (!res.ok) {
    return {
      trackId: null,
      status: String(res.status),
      statusDescription: `HTTP ${res.status}: ${rawXml.slice(0, 400)}`,
      rawXml,
      token,
    };
  }

  const status = extractTag(rawXml, "STATUS") ?? "99";
  const trackIdRaw = extractTag(rawXml, "TRACKID");
  const statusDescription =
    SII_UPLOAD_STATUS[status] ?? `STATUS ${status} (no documentado)`;

  return {
    trackId: status === "0" && trackIdRaw ? trackIdRaw : null,
    status,
    statusDescription,
    rawXml,
    token,
  };
}

/**
 * Conveniencia: extrae el cert desde un .pfx + password y luego llama a
 * `uploadEnvioDteToSii`. Útil cuando el caller solo tiene los bytes
 * cifrados/descifrados del .pfx.
 */
export async function uploadEnvioDteFromPfx(args: {
  sobreXml: Buffer;
  pfxBuffer: Buffer;
  pfxPassword: string;
  rutTitular: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  token?: string;
}): Promise<DteUploadResult> {
  const cert = extractCertFromPfxWithFallback(args.pfxBuffer, args.pfxPassword);
  return uploadEnvioDteToSii({
    sobreXml: args.sobreXml,
    cert,
    rutTitular: args.rutTitular,
    rutEmisor: args.rutEmisor,
    environment: args.environment,
    token: args.token,
  });
}

async function fetchFreshToken(
  cert: CertMaterial,
  environment: SiiEnvironment,
): Promise<string> {
  const seed = await getSiiSeed(environment);
  const signed = signSeedXml(seed, cert);
  return getSiiToken(environment, signed);
}

/** "12345678-9" → ["12345678","9"]; tolera puntos y mayús/min. */
function splitRut(rut: string): [string, string] {
  const clean = rut.replace(/\./g, "").trim().toUpperCase();
  const dashIdx = clean.lastIndexOf("-");
  if (dashIdx <= 0 || dashIdx === clean.length - 1) {
    throw new Error(`RUT inválido (esperado NNNN-D): ${rut}`);
  }
  return [clean.slice(0, dashIdx), clean.slice(dashIdx + 1)];
}

/** Match `<TAG>value</TAG>` en cualquier parte del cuerpo. */
function extractTag(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}
