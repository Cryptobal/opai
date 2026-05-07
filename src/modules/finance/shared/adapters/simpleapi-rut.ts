/**
 * SimpleAPI — adapter para consulta de RUT al SII.
 *
 * Pega al endpoint oficial de SimpleAPI que internamente consulta al SII y
 * devuelve los datos públicos del contribuyente: razón social, giros
 * (actividades económicas), domicilios, fecha inicio actividades, etc.
 *
 * Endpoint:
 *   GET https://rut.simpleapi.cl/v2/{rut}
 *   - Auth: Basic base64("api:" + apikey)
 *   - Sin body (RUT en path).
 *   - Latencia: típicamente 5-15s, pero el SII implementó colas y puede
 *     tardar > 90s. Setear timeout generoso en el caller (recomendado 120s).
 *
 * Response 200 (shape oficial documentado en Postman SimpleAPI):
 *   {
 *     "rut": "<RUT>",
 *     "razonSocial": "<RAZON SOCIAL>",
 *     "actividadesEconomicas": [
 *       {
 *         "codigo": "960909",
 *         "descripcion": "OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.",
 *         "categoria": "Segunda",
 *         "afectaIVA": false,
 *         "fecha": "30-03-2010"
 *       }
 *     ],
 *     "correoIntercambio": "...",
 *     "domicilios": [
 *       { "direccion": "...", "ciudad": "...", "comuna": "..." }
 *     ],
 *     "presentaInicioActividades": true,
 *     "fechaInicioActividades": "30-03-2010",
 *     "esEmpresaMenorTamano": false,
 *     "webFacturacion": ""
 *   }
 *
 * Errores comunes:
 *   - 400: RUT inexistente en SII (mensaje: "No hay registros del RUT ...")
 *   - 401: apikey inválida o sin suscripción al producto SimpleAPI RUT.
 *   - 500: error inesperado / timeout del SII.
 */

import {
  buildSimpleApiUrl,
  getSimpleApiKeyOrThrow,
  type SimpleApiAuth,
} from "./simpleapi-http";

/** Normaliza un RUT a formato `<cuerpo>-<dv>` con DV en mayúscula. */
function normalizeRut(raw: string): string {
  const clean = raw.replace(/[^\dKk]/g, "").toUpperCase();
  if (clean.length < 2) return "";
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

export interface RutLookupActividadEconomica {
  codigo: string;
  descripcion: string;
  categoria: string;
  afectaIVA: boolean;
  fecha: string;
}

export interface RutLookupDomicilio {
  direccion: string;
  ciudad: string;
  comuna: string;
}

export interface RutLookupResultRaw {
  rut: string;
  razonSocial: string;
  actividadesEconomicas: RutLookupActividadEconomica[];
  correoIntercambio: string;
  domicilios: RutLookupDomicilio[];
  presentaInicioActividades: boolean;
  fechaInicioActividades: string;
  esEmpresaMenorTamano: boolean;
  webFacturacion: string;
}

export interface RutLookupSuccess {
  success: true;
  rut: string;
  /** Datos crudos como vienen de SimpleAPI. */
  raw: RutLookupResultRaw;
  /**
   * Resumen normalizado y listo para autocompletar el CrmAccount /
   * receptor de DTE. Toma el primer domicilio y la primera actividad
   * económica como "default" (que es lo que el SII tiene como "principal");
   * el caller puede mostrar también el resto al operador para que elija.
   */
  summary: {
    razonSocial: string;
    /** Descripción de la actividad económica principal. Para `CrmAccount.giro`. */
    giro: string | null;
    /** Código SII de la actividad económica principal. */
    giroCodigo: string | null;
    /** Dirección del domicilio principal. */
    direccion: string | null;
    /** Comuna del domicilio principal. */
    comuna: string | null;
    /** Ciudad del domicilio principal. */
    ciudad: string | null;
    /** Email de intercambio del SII (DTE). */
    correoIntercambio: string | null;
  };
}

export interface RutLookupError {
  success: false;
  rut: string;
  /** Mensaje human-readable. */
  error: string;
  /** HTTP status devuelto por SimpleAPI (si llegó respuesta). */
  httpStatus?: number;
}

export type RutLookupResult = RutLookupSuccess | RutLookupError;

export interface RutLookupOptions {
  /** Override de auth (apiKey/baseUrl). NULL → usa SIMPLEAPI_KEY env. */
  auth?: SimpleApiAuth;
  /**
   * Timeout en ms (default 120s). El SII puede tardar 1-2 min en responder
   * cuando hay colas activas; los callers (UI/API route) deben elegir un
   * valor consistente con su propio timeout.
   */
  timeoutMs?: number;
}

/**
 * Consulta los datos oficiales de un contribuyente al SII vía SimpleAPI.
 *
 * No crashea ante errores: siempre devuelve `{ success, ... }` para que
 * el caller los muestre al usuario sin try/catch.
 */
export async function lookupRutSimpleApi(
  rutInput: string,
  options: RutLookupOptions = {},
): Promise<RutLookupResult> {
  const rut = normalizeRut(rutInput);
  if (!rut || rut.length < 8) {
    return {
      success: false,
      rut: rutInput,
      error: "RUT inválido. Debe tener al menos 7 dígitos + DV.",
    };
  }

  let apiKey: string;
  try {
    apiKey = getSimpleApiKeyOrThrow(options.auth);
  } catch (err) {
    return {
      success: false,
      rut,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const url = buildSimpleApiUrl("rut", `v2/${rut}`, options.auth);
  const credentials = Buffer.from(`api:${apiKey}`).toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 120_000,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      rut,
      error: isAbort
        ? `Timeout consultando el SII (>${options.timeoutMs ?? 120_000}ms). El SII puede tener colas activas; reintentá en unos minutos.`
        : `Red SimpleAPI [rut/v2/${rut}]: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  clearTimeout(timer);

  const text = await res.text();

  if (!res.ok) {
    // HTTP 400 con cuerpo "No hay registros del RUT X en el SII" es
    // semánticamente un "RUT no encontrado", no un error del adapter.
    const trimmed = text.trim().replace(/^"|"$/g, "");
    return {
      success: false,
      rut,
      httpStatus: res.status,
      error:
        trimmed && trimmed.length < 300
          ? trimmed
          : `SimpleAPI [rut/v2/${rut}] HTTP ${res.status}: ${text.slice(0, 200) || "(body vacío)"}`,
    };
  }

  let raw: RutLookupResultRaw;
  try {
    raw = JSON.parse(text) as RutLookupResultRaw;
  } catch {
    return {
      success: false,
      rut,
      httpStatus: res.status,
      error: `Respuesta SimpleAPI no es JSON válido: ${text.slice(0, 200)}`,
    };
  }

  // Normalizamos el "summary" tomando el primer elemento de cada lista
  // (el SII publica los registros más recientes/principales primero,
  // según observamos empíricamente). El caller puede mostrar el resto.
  const primaryActividad = raw.actividadesEconomicas?.[0];
  const primaryDomicilio = raw.domicilios?.[0];

  return {
    success: true,
    rut,
    raw,
    summary: {
      razonSocial: raw.razonSocial?.trim() || "",
      giro: primaryActividad?.descripcion?.trim() || null,
      giroCodigo: primaryActividad?.codigo?.trim() || null,
      direccion: primaryDomicilio?.direccion?.trim() || null,
      comuna: primaryDomicilio?.comuna?.trim() || null,
      ciudad: primaryDomicilio?.ciudad?.trim() || null,
      correoIntercambio: raw.correoIntercambio?.trim() || null,
    },
  };
}
