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

/**
 * Override opcional pasado por el caller (típicamente desde
 * PlatformDteProvider via SimpleApiProvider). Si no viene, se usa env var.
 */
export interface SimpleApiAuth {
  /** apiKey en plaintext. NULL → fallback a SIMPLEAPI_KEY env var. */
  apiKey: string | null;
  /** Base URL para target "api". NULL → fallback a SIMPLEAPI_BASE_URL env. */
  baseUrl: string | null;
}

/** API base por defecto (env var). Puede ser sobrescrita por SimpleApiAuth.baseUrl. */
function defaultApiBaseUrl(): string {
  return normalizeApiBase(
    process.env.SIMPLEAPI_BASE_URL ?? "https://api.simpleapi.cl",
  );
}

/** Scraper base — siempre la misma, no es overridable por tenant ni platform. */
const SCRAPER_BASE_URL =
  process.env.SIMPLEAPI_SCRAPER_BASE_URL ?? "https://servicios.simpleapi.cl/api/";

/** apiKey efectiva: override > env var > "" (vacío → throw en getSimpleApiKeyOrThrow). */
function resolveApiKey(auth?: SimpleApiAuth): string {
  return auth?.apiKey ?? process.env.SIMPLEAPI_KEY ?? "";
}

/** baseUrl efectiva para target=api: override > env var. */
function resolveApiBase(auth?: SimpleApiAuth): string {
  if (auth?.baseUrl) return normalizeApiBase(auth.baseUrl);
  return defaultApiBaseUrl();
}

export type SimpleApiBaseTarget = "api" | "scraper";

function authHeader(apiKey: string): string {
  // Basic base64("api:" + apikey) — formato del SDK oficial.
  const credentials = Buffer.from(`api:${apiKey}`).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * Valida que la apiKey efectiva esté configurada.
 * Acepta override (typicamente desde PlatformDteProvider) y cae en env var.
 */
export function getSimpleApiKeyOrThrow(auth?: SimpleApiAuth): string {
  const key = resolveApiKey(auth);
  if (!key) {
    throw new Error(
      "SimpleAPI: apiKey no configurada. Configurá una en /platform/dte o seteá SIMPLEAPI_KEY env var.",
    );
  }
  return key;
}

export function buildSimpleApiUrl(
  target: SimpleApiBaseTarget,
  path: string,
  auth?: SimpleApiAuth,
): string {
  const base = target === "api" ? resolveApiBase(auth) : SCRAPER_BASE_URL;
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
  /**
   * Auth/baseUrl override. Si no se pasa, lee de env vars (modo legacy).
   * Pasarlo es la forma correcta cuando el caller ya resolvió la config
   * desde PlatformDteProvider.
   */
  auth?: SimpleApiAuth;
}

export interface SimpleApiResponse {
  ok: boolean;
  status: number;
  /** Texto raw devuelto por SimpleAPI (puede ser JSON, XML, o texto). */
  bodyText: string;
  /** Si bodyText era JSON parseable, acá está el objeto. */
  bodyJson: unknown;
  /** Bytes crudos del response. Útil para binarios (PDF, ZIP). */
  bodyBuffer: Buffer;
  /**
   * Headers `x-rate-limit-*` que SimpleAPI devuelve en CADA respuesta
   * cuando reconoce la apikey. Son la prueba más confiable de que la
   * apikey está activa: si vienen, la apikey funciona aunque el HTTP
   * sea 401 (en ese caso el problema está en el payload, no en auth).
   */
  rateLimit: {
    limit: string | null;
    remaining: number | null;
    reset: string | null;
  };
}

/**
 * Llama a SimpleAPI con multipart/form-data y devuelve la respuesta
 * como texto + JSON parseado (si aplica). NO lanza excepción ante !res.ok
 * — el caller decide qué hacer con cada status code.
 */
export async function callSimpleApi(
  opts: SimpleApiRequestOptions,
): Promise<SimpleApiResponse> {
  const apiKey = getSimpleApiKeyOrThrow(opts.auth);
  const url = buildSimpleApiUrl(opts.target, opts.path, opts.auth);
  const { body, contentType } = buildMultipartBody(opts.parts);

  const res = await fetch(url, {
    method: opts.method ?? "POST",
    headers: {
      Authorization: authHeader(apiKey),
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

  const remainingRaw = res.headers.get("x-rate-limit-remaining");
  const remainingNum = remainingRaw !== null ? Number(remainingRaw) : NaN;

  return {
    ok: res.ok,
    status: res.status,
    bodyText,
    bodyJson,
    bodyBuffer: respBuffer,
    rateLimit: {
      limit: res.headers.get("x-rate-limit-limit"),
      remaining: Number.isFinite(remainingNum) ? remainingNum : null,
      reset: res.headers.get("x-rate-limit-reset"),
    },
  };
}

/**
 * Detecta si una respuesta de SimpleAPI indica que la apikey está bloqueada
 * por exceder el cupo mensual o el rate limit. SimpleAPI bloquea con
 * varios códigos según el tipo de límite:
 *
 *   - HTTP 401/403 con mensaje "apikey bloqueada" / "límite mensual"
 *   - HTTP 429 con "rate limit exceeded" (1/sec, 5/min, 100/hora)
 *   - HTTP 402 (Payment Required) en algunos planes
 *
 * El usuario puede desbloquear inmediatamente contratando "Peticiones de
 * Respaldo" en https://panel.simpleapi.cl/ o subiendo de plan.
 */
export function detectApiKeyBlocked(res: SimpleApiResponse): {
  blocked: boolean;
  reason: "EXPIRED" | "QUOTA" | "RATE_LIMIT" | null;
  message: string | null;
} {
  if (res.ok) return { blocked: false, reason: null, message: null };

  const body = res.bodyText.toLowerCase();

  // Rate limit explícito (HTTP 429 o body diciéndolo). Independiente
  // de los rate-limit headers porque también se aplica per-IP en algunos
  // planes.
  const isRateLimit =
    res.status === 429 ||
    body.includes("rate limit") ||
    body.includes("too many requests");

  if (isRateLimit) {
    return {
      blocked: true,
      reason: "RATE_LIMIT",
      message:
        "SimpleAPI rate limit (máx 1/sec, 5/min, 100/hora). Esperá unos minutos y reintentá.",
    };
  }

  // EXPIRED = apikey vencida (plan/contrato expirado). SimpleAPI lo
  // reporta como JSON `{"error":"Apikey vencida..."}` con HTTP 401 en
  // los endpoints de servicios.simpleapi.cl. Lo separamos de QUOTA
  // porque la solución es distinta: hay que renovar el plan, no
  // contratar peticiones de respaldo.
  const bodyLooksExpired =
    body.includes("vencida") ||
    body.includes("vencido") ||
    body.includes("expirada") ||
    body.includes("expirado") ||
    body.includes("expired");

  if (bodyLooksExpired) {
    return {
      blocked: true,
      reason: "EXPIRED",
      message:
        "La apikey de SimpleAPI está VENCIDA (plan/contrato expirado). Andá a https://panel.simpleapi.cl/ → tu cuenta, renová el plan y actualizá SIMPLEAPI_KEY en Vercel si te dieron una nueva. Sin esto NO podés emitir DTEs.",
    };
  }

  // QUOTA = apikey bloqueada por cupo mensual. Solo lo declaramos si
  // el body lo dice explícitamente (la heurística previa marcaba como
  // QUOTA cualquier 401/403, pero SimpleAPI también devuelve 401 con
  // body vacío para errores de payload — eso NO es problema de apikey).
  const bodyLooksQuotaBlocked =
    body.includes("límite mensual") ||
    body.includes("limit mensual") ||
    body.includes("cupo") ||
    body.includes("bloqueada") ||
    body.includes("blocked");

  if (bodyLooksQuotaBlocked && (res.status === 401 || res.status === 402 || res.status === 403)) {
    return {
      blocked: true,
      reason: "QUOTA",
      message:
        "Apikey de SimpleAPI bloqueada (cupo mensual excedido). Desbloqueá inmediatamente en https://panel.simpleapi.cl/ contratando Peticiones de Respaldo, o subí de plan.",
    };
  }

  return { blocked: false, reason: null, message: null };
}

/**
 * Determina si SimpleAPI reconoció la apikey en este request, usando
 * la presencia de los headers `x-rate-limit-*`. SimpleAPI los emite
 * SOLO cuando autenticó exitosamente la apikey y le aplicó el contador,
 * por lo que su presencia es prueba positiva de que la apikey funciona.
 *
 * Cuando un 401 viene con estos headers, el problema está en el
 * payload (cert/CAF/JSON), NO en la apikey.
 */
export function isApiKeyAuthenticated(res: SimpleApiResponse): boolean {
  return res.rateLimit.remaining !== null;
}
