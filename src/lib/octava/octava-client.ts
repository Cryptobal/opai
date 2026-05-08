/**
 * Cliente HTTP para la API REST de App Octava (cesión electrónica).
 *
 * Documentación: https://www.appoctava.cl/wscesion/documentacion-cesion-electronica-api-rest/
 *
 * Octava ofrece "cesión-as-a-service" — recibe nuestro cert digital, firma
 * el AEC localmente en su servidor y lo envía al RPETC del SII, devolviendo
 * el TrackId y eventualmente la URL del AEC firmado en S3.
 *
 * Flujo:
 *   1. RegistraCedente   — one-time por tenant: sube cert + obtiene PassAccesoApi.
 *   2. ObtenerToken      — cada 6h: con RUT+PassAccesoApi obtiene Token.
 *   3. CargaXmlCesion    — sube el XML del DTE a ceder.
 *   4. CedeDte           — ejecuta la cesión con datos del cesionario.
 *   5. ConsultaEstadoAEC — consulta estado y obtiene URL del AEC firmado.
 *
 * Costo: ~$1.000+IVA por factura cedida (cobrado por Octava al integrador).
 *
 * Credenciales del integrador:
 *   - OCTAVA_INTEGRADOR_RUT      — RUT de la empresa que contrató el servicio
 *   - OCTAVA_INTEGRADOR_PASSWORD — Password del integrador
 */

const OCTAVA_BASE_URL = "https://www.appoctava.cl/apirestcesion";

// HTTP timeout. Octava puede tardar varios segundos al subir XML grandes
// (registra el certificado, valida estructura, etc).
const DEFAULT_TIMEOUT_MS = 30_000;

export type OctavaAmbiente = "0" | "1"; // 0=PRUEBAS, 1=PRODUCCIÓN

/**
 * Códigos de resultado del estado de una cesión devuelto por
 * ConsultaEstadoAEC. Espejo de los códigos del RPETC del SII.
 */
export type OctavaCodigoCesion =
  | "EOK" // Envío Aceptado | CESION OK
  | "RSC" // Rechazado por Error en Schema
  | "RFS" // Rechazado por Firma de Sobre
  | "RCR" // Error en Carátula
  | "RDC" // Documento inválido
  | "RCS" // Cesión Inválida
  | "EAN" // Envío Anulado
  | "PEN"; // Pendiente / en proceso

interface OctavaErrorResponse {
  status?: string;
  message?: string;
  IdResultadoFE?: string;
  ResultadoFE?: string;
  DescripcionResultado?: string;
}

export class OctavaApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly httpStatus: number,
    public readonly body: OctavaErrorResponse | string,
    message: string,
  ) {
    super(message);
    this.name = "OctavaApiError";
  }
}

async function octavaPost<TRequest, TResponse>(
  endpoint: string,
  body: TRequest,
  signal?: AbortSignal,
): Promise<TResponse> {
  const url = `${OCTAVA_BASE_URL}/${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  // Forward external abort signal
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : "network error";
    throw new OctavaApiError(endpoint, 0, msg, `Octava ${endpoint}: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let parsed: TResponse;
  try {
    parsed = JSON.parse(text) as TResponse;
  } catch {
    throw new OctavaApiError(
      endpoint,
      res.status,
      text,
      `Octava ${endpoint}: respuesta no es JSON (HTTP ${res.status})`,
    );
  }
  if (!res.ok) {
    throw new OctavaApiError(
      endpoint,
      res.status,
      parsed as OctavaErrorResponse,
      `Octava ${endpoint}: HTTP ${res.status}`,
    );
  }
  return parsed;
}

// ── 1. RegistraCedente ──────────────────────────────────────────────

export interface RegistraCedenteRequest {
  RUT: string;
  RAZONSOCIAL: string;
  RUTAUTORIZADOSII: string;
  NOMBREAUTORIZADOSII: string;
  /** Cert digital (.pfx) en base64. */
  CERTDIGBASE64: string;
  PASSCERTDIG: string;
  INTEGRADOR: string;
  PASSWORDINTEGRADOR: string;
}

export interface RegistraCedenteResponse {
  status: string;
  message: string;
  IdResultadoFE: string;
  ResultadoFE: string;
  PassAccesoApi?: string;
  FechaExpiracionCD?: string;
}

/**
 * Registra una empresa cedente en Octava. One-time por tenant.
 *
 * IdResultadoFE:
 *   0 = Empresa creada — devuelve PassAccesoApi
 *   1 = Password de cert incorrecta
 *   2 = Error administrador
 *   3 = RUT ya registrado (mensaje típico: ya existe en registros — no siempre envía PassAccesoApi de nuevo)
 *   4 = Usuario del cert no autorizado
 *   5 = Error con el cert
 *   6 = Error con cert+RUT
 */
export function registraCedente(
  body: RegistraCedenteRequest,
  signal?: AbortSignal,
): Promise<RegistraCedenteResponse> {
  return octavaPost<RegistraCedenteRequest, RegistraCedenteResponse>(
    "RegistraCedente",
    body,
    signal,
  );
}

// ── 2. ObtenerToken ─────────────────────────────────────────────────

export interface ObtenerTokenRequest {
  RUTACCESOAPI: string;
  PASSWORDACCESOAPI: string;
}

export interface ObtenerTokenResponse {
  status: string;
  message: string;
  /**
   * Códigos:
   *   TOK   = Token generado correctamente
   *   TERR  = Datos de acceso incorrectos
   *   TDUP  = Ya existe un token activo
   *   TBLOQ = Empresa bloqueada
   */
  DescripcionResultado: "TOK" | "TERR" | "TDUP" | "TBLOQ" | string;
  Token?: string;
  TiempoEjecucion?: number;
  FechaHoraRegistro?: string;
}

/**
 * Obtiene un Token (TTL 6h). Si TDUP, hay que reusar el token activo
 * (Octava no devuelve el activo; el caller debe consultar su cache).
 */
export function obtenerToken(
  body: ObtenerTokenRequest,
  signal?: AbortSignal,
): Promise<ObtenerTokenResponse> {
  return octavaPost<ObtenerTokenRequest, ObtenerTokenResponse>(
    "ObtenerToken",
    body,
    signal,
  );
}

// ── 3. CargaXmlCesion ───────────────────────────────────────────────

export interface CargaXmlCesionRequest {
  /** XML del DTE firmado (string, no base64). */
  STRINGXML: string;
  AMBIENTE: OctavaAmbiente;
  TOKEN: string;
}

export interface CargaXmlCesionResponse {
  status: string;
  message: string;
  DescripcionResultado: "TVAL" | "TEXP" | "TINV" | "TDUP" | string;
  IdResultadoFE: string;
  ResultadoFE: string;
  /**
   * Format:
   * |RUT EMISOR,RAZON SOCIAL,TIPO DTE,FOLIO,FECHA EMISION,MONTO,RUT RECEPTOR,
   *  RAZON SOCIAL RECEPTOR,AMBIENTE,IDSECUENCIA||
   */
  TxtCesion?: string;
}

/**
 * Sube el XML del DTE al servidor central de Octava. Idempotente: si el DTE
 * ya existe (IdResultadoFE=5) podemos seguir directo a CedeDte.
 *
 * IdResultadoFE:
 *   0 = XML cargado correctamente
 *   1 = RUT emisor no corresponde al token
 *   2 = Tipo de doc no válido
 *   4 = Imposible almacenar
 *   5 = DTE ya cargado (OK para flow)
 */
export function cargaXmlCesion(
  body: CargaXmlCesionRequest,
  signal?: AbortSignal,
): Promise<CargaXmlCesionResponse> {
  return octavaPost<CargaXmlCesionRequest, CargaXmlCesionResponse>(
    "CargaXmlCesion",
    body,
    signal,
  );
}

// ── 4. CedeDte ──────────────────────────────────────────────────────

export interface CedeDteRequest {
  FOLIO: string;
  TIPODTE: string;
  RUTEMISOR: string;
  AMBIENTE: OctavaAmbiente;
  DIRECCIONCEDENTE: string;
  EMAILCEDENTE: string;
  RUTCESIONARIO: string;
  RAZONSOCIALCESIONARIO: string;
  DIRECCIONCESIONARIO: string;
  EMAILCESIONARIO: string;
  NOMBRECONTACTO: string;
  EMAILCONTACTO: string;
  MONTOCEDER: string;
  /** YYYY-MM-DD */
  FECHAVENCIMIENTO: string;
  EMAILDEUDOR: string;
  TOKEN: string;
}

export interface CedeDteResponse {
  status: string;
  message: string;
  DescripcionResultado: "TVAL" | "TEXP" | "TINV" | "TDUP" | string;
  IdResultadoFE: string;
  ResultadoFE: string;
}

/**
 * Ejecuta la cesión del DTE ya cargado.
 *
 * IdResultadoFE:
 *   0 = DTE cedido correctamente
 *   1 = DTE no encontrado
 *   2 = Error al generar cesión
 *   3 = DTE ya cedido
 *   4 = No es el actual tenedor (re-cesión)
 */
export function cedeDte(
  body: CedeDteRequest,
  signal?: AbortSignal,
): Promise<CedeDteResponse> {
  return octavaPost<CedeDteRequest, CedeDteResponse>("CedeDte", body, signal);
}

// ── 5. ConsultaEstadoAEC ────────────────────────────────────────────

export interface ConsultaEstadoAecRequest {
  FOLIO: string;
  TIPODTE: string;
  RUTEMISOR: string;
  AMBIENTE: OctavaAmbiente;
  TOKEN: string;
}

export interface ConsultaEstadoAecResponse {
  status: string;
  message: string;
  DescripcionResultado: "TVAL" | "TEXP" | "TINV" | "TDUP" | string;
  IdResultadoFE: string;
  ResultadoFE: string;
  CodigoCesion?: OctavaCodigoCesion;
  /** URL pública en S3 del AEC firmado (solo cuando CodigoCesion=EOK). */
  UrlAec?: string;
}

export function consultaEstadoAec(
  body: ConsultaEstadoAecRequest,
  signal?: AbortSignal,
): Promise<ConsultaEstadoAecResponse> {
  return octavaPost<ConsultaEstadoAecRequest, ConsultaEstadoAecResponse>(
    "ConsultaEstadoAEC",
    body,
    signal,
  );
}

// ── Helpers de polling ──────────────────────────────────────────────

/**
 * Hace polling de ConsultaEstadoAEC hasta que el estado sea "final"
 * (EOK o cualquier rechazo Rxx). El SII tarda entre 30s y 5min en
 * procesar un AEC.
 */
export async function pollConsultaEstadoAec(
  body: ConsultaEstadoAecRequest,
  opts: {
    maxAttempts?: number;
    intervalMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ConsultaEstadoAecResponse> {
  const maxAttempts = opts.maxAttempts ?? 12; // 12*15s = 3 min
  const intervalMs = opts.intervalMs ?? 15_000;

  let last: ConsultaEstadoAecResponse | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    if (opts.signal?.aborted) throw new Error("Polling abortado");
    last = await consultaEstadoAec(body, opts.signal);
    const code = last.CodigoCesion;
    // Códigos finales: EOK o cualquier rechazo
    if (code && code !== "PEN") {
      return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (!last) throw new Error("Polling sin respuesta");
  return last;
}
