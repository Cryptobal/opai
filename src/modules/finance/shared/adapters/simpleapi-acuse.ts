/**
 * SimpleAPI — adapter para Acuse de Recibo / Aceptación / Reclamo de
 * DTEs RECIBIDOS desde proveedores.
 *
 * Notifica al SII (vía SimpleAPI) que el receptor:
 *   - **ACD** (Acepta Contenido del Documento): valida el contenido del DTE
 *     pero NO permite usar el crédito IVA por sí solo. Para uso de crédito
 *     se requiere también ERM.
 *   - **ERM** (Entrega Recibo de Mercaderías): otorga acuse de recibo de
 *     mercaderías o servicios. Habilita uso de crédito IVA. La práctica
 *     habitual para "aceptar de verdad" es enviar ACD + ERM en 2 llamadas
 *     consecutivas (este adapter expone un helper `acceptAndAcknowledge`
 *     que las orquesta).
 *   - **RCD** (Reclamo al Contenido): rechaza el contenido del DTE.
 *   - **RFP** (Reclamo por Falta Parcial de Mercaderías): se recibió parte
 *     de las mercaderías facturadas.
 *   - **RFT** (Reclamo por Falta Total de Mercaderías): no se recibió
 *     ninguna mercadería de las facturadas.
 *
 * Plazo legal SII: 8 días corridos desde la recepción del DTE para
 * reclamar. Si pasan los 8 días sin reclamo, queda aceptado tácitamente y
 * NO se puede objetar después. Esta lógica de plazo se valida en el
 * service caller (`dte-received-acuse.service.ts`), no acá.
 *
 * Endpoint (descubierto desde la colección Postman oficial de SimpleAPI):
 *   POST  api.simpleapi.cl/api/v1/compras/aceptacionreclamo
 *   - Auth: Basic base64("api:" + apikey)
 *   - Multipart con `input` (JSON) + `files` (cert .pfx binario)
 *
 * Payload `input`:
 *   {
 *     "Certificado": { "Rut": "RUT_TITULAR_PFX", "Password": "..." },
 *     "Tipo": 33,
 *     "Folio": 12345,
 *     "Accion": "ACD",
 *     "RutEmpresa": "RUT_EMPRESA_RECEPTORA_DEL_DTE",
 *     "Ambiente": 1
 *   }
 *
 * `RutEmpresa` es el RUT del **receptor** del DTE (= la empresa del
 * tenant OPAI que está acusando), NO el del proveedor que lo emitió.
 * El SII usa el cert para autenticar, y `RutEmpresa` para identificar
 * sobre qué libro de compras se aplica el acuse.
 */

import { callSimpleApi, type SimpleApiAuth } from "./simpleapi-http";

/** Códigos de acción aceptados por el SII. */
export type AcuseAccion = "ACD" | "RCD" | "ERM" | "RFP" | "RFT";

export interface AcuseContext {
  auth: SimpleApiAuth;
  environment: "CERTIFICATION" | "PRODUCTION";
  pfxBuffer: Buffer;
  pfxPassword: string;
  rutTitular: string;
  /** RUT de la empresa receptora del DTE (= tenant OPAI que acusa). */
  rutEmpresa: string;
}

export interface AcuseRequest {
  /** Tipo SII del DTE (33, 34, 43, 46, 56, 61, etc.). */
  dteType: number;
  /** Folio del DTE recibido. */
  folio: number;
  /** Acción a notificar al SII. */
  accion: AcuseAccion;
}

export interface AcuseResponse {
  success: boolean;
  /** Mensaje de error human-readable cuando success=false. */
  error?: string;
  /** TrackId que asigna el SII al acuse (puede no venir en todos los casos). */
  trackId?: string;
  /** Status code crudo de SimpleAPI (útil para diagnóstico). */
  httpStatus?: number;
  /** Body crudo de la respuesta. Útil para auditoría / debugging. */
  rawResponse?: unknown;
}

/**
 * Notifica una sola acción de acuse/aceptación/reclamo al SII.
 *
 * Para "aceptación con uso de crédito IVA" usar `acceptAndAcknowledge`
 * que envuelve ACD + ERM en una sola operación atómica (si ACD falla,
 * no se manda ERM; si ERM falla después de ACD, el caller es responsable
 * de reportarlo).
 */
export async function acuseRecibidoSimpleApi(
  request: AcuseRequest,
  ctx: AcuseContext,
): Promise<AcuseResponse> {
  const ambiente = ctx.environment === "PRODUCTION" ? 1 : 0;

  const payload = {
    Certificado: {
      Rut: ctx.rutTitular,
      Password: ctx.pfxPassword,
    },
    Tipo: request.dteType,
    Folio: request.folio,
    Accion: request.accion,
    RutEmpresa: ctx.rutEmpresa,
    Ambiente: ambiente,
  };

  let result;
  try {
    result = await callSimpleApi({
      auth: ctx.auth,
      target: "api",
      path: "compras/aceptacionreclamo",
      method: "POST",
      parts: [
        { name: "input", content: JSON.stringify(payload) },
        {
          name: "files",
          content: ctx.pfxBuffer,
          contentType: "application/x-pkcs12",
          filename: "certificado.pfx",
        },
      ],
    });
  } catch (err) {
    return {
      success: false,
      error: `Red SimpleAPI [compras/aceptacionreclamo]: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (!result.ok) {
    const trimmedBody = result.bodyText.trim();
    return {
      success: false,
      httpStatus: result.status,
      error:
        `SimpleAPI [compras/aceptacionreclamo] HTTP ${result.status}: ` +
        (trimmedBody.slice(0, 400) || "(body vacío)"),
      rawResponse: result.bodyJson ?? result.bodyText,
    };
  }

  // Respuesta típica: JSON con `TrackId` y/o un mensaje de éxito.
  // Algunos endpoints SimpleAPI devuelven solo string "OK" o un XML.
  const json = result.bodyJson as
    | {
        TrackId?: number | string;
        trackId?: number | string;
        Estado?: string;
        Mensaje?: string;
      }
    | null;

  const trackId = json?.TrackId ?? json?.trackId;

  return {
    success: true,
    httpStatus: result.status,
    trackId: trackId !== undefined && trackId !== null && trackId !== "" && trackId !== 0
      ? String(trackId)
      : undefined,
    rawResponse: json ?? result.bodyText,
  };
}

/**
 * Acepta un DTE y entrega el acuse de recibo de mercaderías en una sola
 * operación lógica. Manda 2 llamadas secuenciales:
 *   1. ACD (Acepta Contenido)
 *   2. ERM (Entrega Recibo de Mercaderías) — habilita uso de crédito IVA
 *
 * Si ACD falla, no se manda ERM. Si ERM falla después de un ACD exitoso,
 * el documento queda aceptado parcialmente (sin habilitar crédito IVA);
 * la respuesta refleja esa situación intermedia para que el caller
 * persista el estado real y avise al usuario.
 */
export async function acceptAndAcknowledge(
  request: Omit<AcuseRequest, "accion">,
  ctx: AcuseContext,
): Promise<{
  success: boolean;
  acdResult: AcuseResponse;
  ermResult?: AcuseResponse;
  error?: string;
}> {
  const acdResult = await acuseRecibidoSimpleApi(
    { ...request, accion: "ACD" },
    ctx,
  );
  if (!acdResult.success) {
    return {
      success: false,
      acdResult,
      error: acdResult.error,
    };
  }

  const ermResult = await acuseRecibidoSimpleApi(
    { ...request, accion: "ERM" },
    ctx,
  );
  if (!ermResult.success) {
    return {
      success: false,
      acdResult,
      ermResult,
      error:
        `Aceptación de contenido (ACD) OK, pero falló el acuse de mercaderías (ERM): ${ermResult.error}. ` +
        `El DTE queda aceptado en SII pero NO se podrá usar el crédito IVA hasta que se complete ERM manualmente.`,
    };
  }

  return { success: true, acdResult, ermResult };
}
