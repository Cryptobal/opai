/**
 * SimpleAPI — adapter de cesión electrónica (Bloque 2 factoring v3).
 *
 * Implementa el flujo de generar + enviar AEC al SII, basado en el SDK
 * oficial de Chilesystems y validado en producción contra Gard
 * (TrackId 11998878336 → EOK confirmado por SII, ver Bloque 0).
 *
 * Flujo (2 pasos secuenciales contra `api.simpleapi.cl`):
 *
 *   1. POST /api/v1/dte/cesion/generar
 *      multipart: input(JSON DocumentoAEC) + file(.pfx) + file(DTE.xml)
 *      → AEC.xml firmado (response body, ISO-8859-1)
 *
 *   2. POST /api/v1/cesion/enviar
 *      multipart: input(JSON Tipo:5) + files(AEC.xml)  ← campo plural
 *      → JSON con TrackId asignado por el SII
 *
 * Validaciones críticas POST-generación (Ley 19.983):
 *   El AEC debe contener <DocumentoAEC>, <Signature>, y al menos uno
 *   de: declaración jurada o recibo electrónico. Si falta la
 *   declaración jurada Y no hay recibo electrónico, el AEC NO da
 *   mérito ejecutivo y el factoring no podrá cobrar al deudor.
 *   Retornamos error explícito en ese caso.
 *
 * Referencia visual del flujo (sandbox B0):
 *   scripts/factoring/cesion-sandbox-steps.ts
 */

import {
  callSimpleApi,
  describeSimpleApiError,
  type SimpleApiAuth,
} from "./simpleapi-http";
import type {
  DteCedeRequest,
  DteCedeResponse,
} from "./dte-provider.adapter";

/**
 * Contexto del tenant que el provider resuelve y le pasa al adapter
 * de cesión. Incluye material desencriptado del cert (NO loguear).
 */
export interface CesionContext {
  auth: SimpleApiAuth;
  environment: "CERTIFICATION" | "PRODUCTION";
  pfxBuffer: Buffer;
  pfxPassword: string;
  rutTitular: string;
}

/**
 * Construye el JSON DocumentoAEC con el shape que espera SimpleAPI
 * (mapeado al schema oficial AEC del SII via SDK Chilesystems).
 *
 * V1 — solo cesión TOTAL, secuencia=1, sin OtrasCondiciones extras.
 */
function buildDocumentoAecPayload(
  request: DteCedeRequest,
): Record<string, unknown> {
  return {
    Caratula: {
      RutCedente: request.dteIssuerRut,
      RutCesionario: request.cesionarioRut,
      NombreContacto: request.contactNombre,
      FonoContacto: request.contactFono ?? "",
      MailContacto: request.contactEmail,
    },
    Cesiones: [
      {
        Secuencia: 1,
        IdentificacionDTE: {
          TipoDTE: request.dteType,
          RUTEmisor: request.dteIssuerRut,
          RUTReceptor: request.dteReceiverRut,
          Folio: request.dteFolio,
          FechaEmision: request.dteDate,
          MontoTotal: Math.round(request.dteTotalAmount),
        },
        Cedente: {
          RUT: request.dteIssuerRut,
          RazonSocial: request.cedenteRazonSocial,
          Direccion: request.cedenteDireccion || "Sin direccion",
          eMail: request.cedenteEmail || "noreply@opai.cl",
          // RUTsAutorizados: persona natural del cert digital que firma.
          // SII exige al menos 1 elemento aquí.
          RUTsAutorizados: [
            { RUT: request.rutAutorizadoRut, Nombre: request.rutAutorizadoNombre },
          ],
        },
        Cesionario: {
          RUT: request.cesionarioRut,
          RazonSocial: request.cesionarioRazonSocial,
          Direccion: request.cesionarioDireccion || "Sin direccion",
          eMail: request.cesionarioEmail || "noreply@opai.cl",
        },
        MontoCesion: Math.round(request.montoCesion),
        UltimoVencimiento: request.fechaUltimoVencimiento,
        OtrasCondiciones: request.otrasCondiciones ?? "",
        eMailDeudor: request.emailDeudor ?? "",
      },
    ],
  };
}

/**
 * PASO 1 — POST /api/v1/dte/cesion/generar.
 * Devuelve el AEC firmado en bytes (ISO-8859-1).
 */
async function generarAec(
  request: DteCedeRequest,
  ctx: CesionContext,
): Promise<{ ok: true; aecXml: Buffer } | { ok: false; error: string }> {
  const payload = {
    DocumentoAEC: buildDocumentoAecPayload(request),
    Certificado: { Rut: ctx.rutTitular, Password: ctx.pfxPassword },
  };

  const result = await callSimpleApi({
    auth: ctx.auth,
    target: "api",
    path: "dte/cesion/generar",
    method: "POST",
    parts: [
      { name: "input", content: JSON.stringify(payload) },
      {
        name: "file",
        content: ctx.pfxBuffer,
        contentType: "application/x-pkcs12",
        filename: "cert.pfx",
      },
      {
        name: "file",
        content: request.dteXml,
        contentType: "application/xml",
        filename: `dte_${request.dteFolio}.xml`,
      },
    ],
  });

  if (!result.ok) {
    return {
      ok: false,
      error: describeSimpleApiError("dte/cesion/generar", result),
    };
  }

  // El body es el AEC firmado en latin1.
  return { ok: true, aecXml: Buffer.from(result.bodyText, "latin1") };
}

/**
 * Validación post-generación del AEC (Ley 19.983 — mérito ejecutivo).
 * Si no hay declaración jurada NI recibo electrónico, el AEC no sirve
 * para que el factoring cobre al deudor.
 */
function validateAecMeritoEjecutivo(aecXml: Buffer): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  const aecText = aecXml.toString("latin1");
  if (!aecText.includes("DocumentoAEC")) {
    return { ok: false, error: "AEC sin <DocumentoAEC> (estructura inválida)" };
  }
  if (!aecText.includes("Signature")) {
    return { ok: false, error: "AEC sin <Signature> (no firmado)" };
  }
  const hasReciboElec =
    aecText.includes("<EnvioRecibos>") || aecText.includes("<MnsjRecibo>");
  const hasDeclaracionJurada =
    aecText.includes("DeclaracionJurada") || aecText.includes("<DeclJurada>");
  if (!hasReciboElec && !hasDeclaracionJurada) {
    return {
      ok: false,
      error:
        "AEC generado SIN declaración jurada ni recibo electrónico. " +
        "Esto invalida el mérito ejecutivo (Ley 19.983) — el factoring " +
        "no podría cobrar al deudor. Verificar config SimpleAPI o " +
        "agregar declaración jurada manualmente al payload.",
    };
  }
  return { ok: true };
}

/**
 * PASO 2 — POST /api/v1/cesion/enviar.
 * Devuelve el TrackId asignado por el SII (sincrónicamente).
 *
 * Detalles críticos del payload:
 *   - Tipo: 5  (EnvioType.Cesion en el SDK; ≠ 0 para DTE)
 *   - Campo multipart: "files" (PLURAL) — único endpoint de SimpleAPI
 *     que usa este nombre, los demás usan "file" singular.
 */
async function enviarAec(
  request: DteCedeRequest,
  ctx: CesionContext,
  aecXml: Buffer,
): Promise<
  | { ok: true; trackId: string; status: string | null; raw: unknown }
  | { ok: false; error: string }
> {
  const payload = {
    Autenticacion: { Rut: ctx.rutTitular, Password: ctx.pfxPassword },
    CorreoNotificacion: request.cedenteEmail || "noreply@opai.cl",
    Ambiente: ctx.environment === "PRODUCTION" ? 1 : 0,
    Tipo: 5,
  };

  const result = await callSimpleApi({
    auth: ctx.auth,
    target: "api",
    path: "cesion/enviar",
    method: "POST",
    parts: [
      { name: "input", content: JSON.stringify(payload) },
      {
        name: "files",
        content: aecXml,
        contentType: "application/xml",
        filename: `aec_${request.dteFolio}.xml`,
      },
    ],
  });

  if (!result.ok) {
    return {
      ok: false,
      error: describeSimpleApiError("cesion/enviar", result),
    };
  }

  const json = result.bodyJson as
    | { TrackId?: number | string; trackId?: number | string; Estado?: string }
    | null;
  const tid = json?.TrackId ?? json?.trackId;
  if (tid === undefined || tid === null || tid === "" || tid === 0) {
    return {
      ok: false,
      error:
        `cesion/enviar OK pero sin TrackId. Estado: ${json?.Estado ?? "desconocido"}. ` +
        `Body: ${result.bodyText.slice(0, 300)}`,
    };
  }

  return {
    ok: true,
    trackId: String(tid),
    status: json?.Estado ?? null,
    raw: json,
  };
}

/**
 * Entry point del adapter de cesión. Orquesta los 2 pasos y valida el
 * AEC antes de enviarlo. NO consulta estado SII — eso lo hace el cron
 * vía SOAP wsRPETCConsulta (Bloque 9).
 */
export async function cedeDteSimpleApi(
  request: DteCedeRequest,
  ctx: CesionContext,
): Promise<DteCedeResponse> {
  // PASO 1 — generar AEC firmado.
  const generarResult = await generarAec(request, ctx);
  if (!generarResult.ok) {
    return { success: false, error: generarResult.error };
  }
  const aecXml = generarResult.aecXml;

  // Validación crítica del AEC.
  const validation = validateAecMeritoEjecutivo(aecXml);
  if (!validation.ok) {
    return { success: false, aecXml, error: validation.error };
  }

  // PASO 2 — enviar AEC al SII.
  const enviarResult = await enviarAec(request, ctx, aecXml);
  if (!enviarResult.ok) {
    return { success: false, aecXml, error: enviarResult.error };
  }

  return {
    success: true,
    trackId: enviarResult.trackId,
    aecXml,
    status: enviarResult.status ?? undefined,
    rawResponse: enviarResult.raw,
  };
}
