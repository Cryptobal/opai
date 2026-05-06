/**
 * SimpleAPI HTTP helpers
 *
 * Encapsula los detalles low-level de la integración con SimpleAPI
 * (Chilesystems) para que el provider los use sin preocuparse del
 * formato exacto. Basado en el SDK oficial:
 *   https://github.com/chilesystems/SimpleSDK
 *
 * Fundamentos clave (NO inventar — están en el SDK):
 *
 * 1. **Dos base URLs según tipo de operación**:
 *    - DTE/Envío/Estado:  https://api.simpleapi.cl/api/v1/
 *    - Folios (CAFs):     https://servicios.simpleapi.cl/api/
 *
 * 2. **Auth header**: Basic con `base64("api:" + apikey)`. NO es
 *    `Authorization: <apikey>` directo.
 *
 * 3. **Content-Type del request body**: `multipart/form-data`
 *    con un campo `input` (JSON serializado del payload) más
 *    archivos binarios (`file` para certificado, `file` para CAF).
 *
 * 4. **Encoding de lectura de respuesta**: ISO-8859-1. El SII exige
 *    esa codificación en sus XMLs y SimpleAPI la respeta.
 */

/**
 * Normaliza la base URL de SimpleAPI agregando `/api/v1/` si falta.
 * Necesario porque la env var SIMPLEAPI_BASE_URL históricamente se setea
 * solo como `https://api.simpleapi.cl` sin path, y eso provoca 404 en
 * todos los endpoints DTE. Esta función protege contra ese error de config.
 */
function normalizeApiBase(raw: string): string {
  const url = raw.replace(/\/$/, ""); // sin trailing slash
  // Si ya contiene /api/v1, lo dejamos tal cual (con trailing slash garantizado)
  if (/\/api\/v\d+/i.test(url)) return `${url}/`;
  return `${url}/api/v1/`;
}

const API_BASE_URL = normalizeApiBase(
  process.env.SIMPLEAPI_BASE_URL ?? "https://api.simpleapi.cl",
);
const SCRAPER_BASE_URL =
  process.env.SIMPLEAPI_SCRAPER_BASE_URL ?? "https://servicios.simpleapi.cl/api/";

const API_KEY = process.env.SIMPLEAPI_KEY ?? "";

export type SimpleApiBaseTarget = "api" | "scraper";

function authHeader(): string {
  // Basic base64("api:" + apikey) — formato del SDK oficial.
  const credentials = Buffer.from(`api:${API_KEY}`).toString("base64");
  return `Basic ${credentials}`;
}

export function getSimpleApiKeyOrThrow(): string {
  if (!API_KEY) {
    throw new Error(
      "SIMPLEAPI_KEY no está configurada. Setear env var antes de llamar a SimpleAPI.",
    );
  }
  return API_KEY;
}

export function buildSimpleApiUrl(
  target: SimpleApiBaseTarget,
  path: string,
): string {
  const base = target === "api" ? API_BASE_URL : SCRAPER_BASE_URL;
  // Garantiza un único slash entre base y path.
  const trimmed = path.replace(/^\//, "");
  return base.endsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
}

export interface SimpleApiMultipartPart {
  /** Nombre del campo (ej "input", "file"). */
  name: string;
  /** Si es texto JSON, pasalo como string. Si es archivo, como Buffer. */
  content: string | Buffer;
  /** Solo cuando content es Buffer. Default "application/octet-stream". */
  contentType?: string;
  /** Solo cuando content es Buffer. Nombre lógico del archivo. */
  filename?: string;
}

/**
 * Construye un cuerpo multipart/form-data manualmente. Lo hago a mano
 * (en vez de usar `FormData` global de Node 18+) porque necesito control
 * fino sobre los headers y el tipo de cada parte para que SimpleAPI lo
 * acepte. La librería `form-data` también serviría pero suma dependencia.
 */
export function buildMultipartBody(parts: SimpleApiMultipartPart[]): {
  body: Buffer;
  contentType: string;
} {
  const boundary = `----opai-simpleapi-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const CRLF = "\r\n";
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}${CRLF}`));

    if (typeof part.content === "string") {
      // Campo de texto: por convención "input" lleva JSON.
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"${CRLF}` +
            `Content-Type: application/json; charset=ISO-8859-1${CRLF}${CRLF}`,
        ),
      );
      // Codificamos en ISO-8859-1 para compatibilidad con SII (que rechaza
      // caracteres fuera del set Latin-1).
      chunks.push(Buffer.from(part.content, "latin1"));
    } else {
      // Campo de archivo binario.
      const filename = part.filename ?? "file.bin";
      const ctype = part.contentType ?? "application/octet-stream";
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${filename}"${CRLF}` +
            `Content-Type: ${ctype}${CRLF}${CRLF}`,
        ),
      );
      chunks.push(part.content);
    }

    chunks.push(Buffer.from(CRLF));
  }

  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export interface SimpleApiRequestOptions {
  target: SimpleApiBaseTarget;
  path: string;
  method?: "GET" | "POST";
  parts: SimpleApiMultipartPart[];
}

export interface SimpleApiResponse {
  ok: boolean;
  status: number;
  /** Texto raw devuelto por SimpleAPI (puede ser JSON, XML, o texto). */
  bodyText: string;
  /** Si bodyText era JSON parseable, acá está el objeto. */
  bodyJson: unknown;
}

/**
 * Llama a SimpleAPI con multipart/form-data y devuelve la respuesta
 * como texto + JSON parseado (si aplica). NO lanza excepción ante !res.ok
 * — el caller decide qué hacer con cada status code.
 */
export async function callSimpleApi(
  opts: SimpleApiRequestOptions,
): Promise<SimpleApiResponse> {
  getSimpleApiKeyOrThrow();
  const url = buildSimpleApiUrl(opts.target, opts.path);
  const { body, contentType } = buildMultipartBody(opts.parts);

  const res = await fetch(url, {
    method: opts.method ?? "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": contentType,
      // Le decimos a SimpleAPI qué codificación esperar en la respuesta.
      Accept: "application/json, text/xml, text/plain",
    },
    body: new Uint8Array(body),
  });

  // Leemos como buffer para poder respetar el charset que SimpleAPI usa
  // en la respuesta (puede ser ISO-8859-1 para XMLs, UTF-8 para JSON).
  const arrayBuffer = await res.arrayBuffer();
  const respBuffer = Buffer.from(arrayBuffer);

  // Heurística simple: si el primer chunk parece JSON o UTF-8 decoder
  // funciona sin reemplazos, lo decodificamos como UTF-8. Si parece
  // XML con ISO-8859-1, lo decodificamos como latin1.
  const utf8 = respBuffer.toString("utf8");
  const looksXmlIso = /encoding="ISO-8859-1"/i.test(utf8);
  const bodyText = looksXmlIso ? respBuffer.toString("latin1") : utf8;

  let bodyJson: unknown = null;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    bodyJson = null;
  }

  return { ok: res.ok, status: res.status, bodyText, bodyJson };
}
