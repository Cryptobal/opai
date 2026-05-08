/**
 * Adapter de cesión electrónica directo al SII (sin SimpleAPI).
 *
 * Propósito: el plan SimpleAPI contratado por algunos tenants (incluyendo
 * Gard) NO incluye el módulo de cesión electrónica. Este adapter
 * construye y firma el AEC nosotros mismos con el cert del tenant
 * (mismo que ya usamos para emitir DTE) y lo envía directo al RPETC
 * del SII vía `RTCAnotEnvio.cgi`.
 *
 * Ver `HANDOFF-CESION-SII-DIRECT.md` (raíz del repo) para el contexto
 * completo, decisiones técnicas y el flujo end-to-end.
 *
 * Pipeline interno (4 pasos):
 *
 *   1. `buildUnsignedAec(...)`            — XML AEC sin firmar.
 *   2. `signAec(...)`                     — 3 firmas XMLDSig.
 *   3. `validateAecMeritoEjecutivo(...)`  — guard Ley 19.983.
 *   4. `getOrCreateSiiToken(...)` + `sendAecToSii(...)` — POST RTC.
 *
 * Cualquier paso puede fallar y se mapea a un `DteCedeResponse` con
 * mensaje legible. NO throwea hacia arriba: el `cession.service` espera
 * recibir errores estructurados.
 */

import { buildUnsignedAec } from "@/lib/sii/aec-builder";
import { signAec } from "@/lib/sii/aec-signer";
import { validateAecMeritoEjecutivo } from "@/lib/sii/aec-validator";
import { sendAecToSii } from "@/lib/sii/aec-sender";
import { getOrCreateSiiToken } from "@/modules/finance/factoring/sii-soap.service";
import type { SiiEnvironment } from "@/lib/sii/soap-client";
import type {
  DteCedeRequest,
  DteCedeResponse,
} from "./dte-provider.adapter";

/** Contexto del tenant que el caller resuelve antes de invocar el adapter. */
export interface SiiDirectCesionContext {
  /** Ambiente SII (cert vs prod). Determina hosts del token y del RTC. */
  environment: SiiEnvironment;
  /** PFX descifrado del tenant (`TenantDteCertificate.pfxDataEnc` post-decrypt). */
  pfxBuffer: Buffer;
  /** Password del PFX descifrado. */
  pfxPassword: string;
  /**
   * RUT del titular del cert (persona natural). Se usa como key del cache
   * de tokens del SII y como `RutAutorizado` dentro del AEC.
   */
  rutTitular: string;
  /**
   * Email donde el SII notifica al cedente. Típicamente
   * `TenantDteConfig.emisorEmail`.
   */
  emailNotif: string;
}

/**
 * Genera un timestamp ISO local sin "Z" (`YYYY-MM-DDTHH:MM:SS`) — formato
 * usado por SII para los `TmstFirma*` del AEC. Usamos UTC y le quitamos
 * el sufijo Z + ms; en Chile el SII acepta este formato sin tz.
 */
function nowTmstFirma(): string {
  return new Date().toISOString().slice(0, 19);
}

/**
 * Entry point del adapter directo. Misma firma que `cedeDteSimpleApi`:
 * recibe un `DteCedeRequest` + contexto del tenant, devuelve un
 * `DteCedeResponse` con éxito + trackId o error legible.
 */
export async function cedeDteSiiDirect(
  request: DteCedeRequest,
  ctx: SiiDirectCesionContext,
): Promise<DteCedeResponse> {
  // ── PASO 1 — Construir AEC sin firmar ──
  let unsignedXml: string;
  try {
    const built = buildUnsignedAec({
      dteXml: request.dteXml,
      idDte: {
        tipoDte: request.dteType,
        folio: request.dteFolio,
        fechaEmision: request.dteDate,
        rutEmisor: request.dteIssuerRut,
        // El AEC real EOK NO mete RznSocEmisor/Receptor en <IdDTE>
        // (solo se usan para la DeclaracionJurada). Pasamos los valores
        // disponibles; si el receiverName no vino, usamos el RUT como
        // fallback para que el texto de la declaración no quede vacío.
        rznSocEmisor: request.cedenteRazonSocial,
        rutReceptor: request.dteReceiverRut,
        rznSocReceptor: request.dteReceiverName ?? request.dteReceiverRut,
        mntTotal: request.dteTotalAmount,
      },
      cedente: {
        rut: request.dteIssuerRut,
        razonSocial: request.cedenteRazonSocial,
        direccion: request.cedenteDireccion || "Sin direccion",
        email: request.cedenteEmail || "noreply@opai.cl",
        rutAutorizado: request.rutAutorizadoRut,
        nombreAutorizado: request.rutAutorizadoNombre,
      },
      cesionario: {
        rut: request.cesionarioRut,
        razonSocial: request.cesionarioRazonSocial,
        direccion: request.cesionarioDireccion || "Sin direccion",
        email: request.cesionarioEmail || "noreply@opai.cl",
      },
      terminos: {
        montoCesion: request.montoCesion,
        ultimoVencimiento: request.fechaUltimoVencimiento,
        emailDeudor: request.emailDeudor,
      },
      contacto: {
        nombre: request.contactNombre,
        fono: request.contactFono,
        mail: request.contactEmail,
      },
      tmstFirma: nowTmstFirma(),
    });
    unsignedXml = built.xml;
  } catch (err) {
    return {
      success: false,
      error: `Error construyendo AEC: ${(err as Error).message}`,
    };
  }

  // ── PASO 2 — Aplicar las 3 firmas XMLDSig ──
  let signedXml: string;
  try {
    signedXml = signAec({
      unsignedXml,
      pfxBuffer: ctx.pfxBuffer,
      pfxPassword: ctx.pfxPassword,
    });
  } catch (err) {
    return {
      success: false,
      error: `Error firmando AEC con cert digital: ${(err as Error).message}`,
    };
  }

  // El XML lleva `encoding="ISO-8859-1"`. Convertir a Buffer latin1
  // para que los bytes coincidan con el encoding declarado (string JS
  // es UTF-16 internamente y mandar `Buffer.from(s)` por default usa
  // UTF-8, lo cual rompería caracteres acentuados/ñ).
  const aecXmlBuffer = Buffer.from(signedXml, "latin1");

  // ── PASO 3 — Validar mérito ejecutivo (Ley 19.983) ──
  const validation = validateAecMeritoEjecutivo(aecXmlBuffer);
  if (!validation.ok) {
    return {
      success: false,
      aecXml: aecXmlBuffer,
      error: validation.error,
    };
  }

  // ── PASO 4 — Obtener token SII y enviar al RTC ──
  let token: string;
  try {
    token = await getOrCreateSiiToken(
      ctx.rutTitular,
      ctx.pfxBuffer,
      ctx.pfxPassword,
      ctx.environment,
    );
  } catch (err) {
    return {
      success: false,
      aecXml: aecXmlBuffer,
      error: `Error obteniendo token SII: ${(err as Error).message}`,
    };
  }

  const sendResult = await sendAecToSii({
    env: ctx.environment,
    token,
    aecXml: aecXmlBuffer,
    rutCedente: request.dteIssuerRut,
    emailNotif: ctx.emailNotif,
    fileName: `AEC_${request.dteFolio}.xml`,
  });

  if (!sendResult.ok) {
    return {
      success: false,
      aecXml: aecXmlBuffer,
      status: sendResult.status,
      rawResponse: sendResult.rawXml,
      error:
        `SII rechazó AEC. STATUS=${sendResult.status ?? "?"} ` +
        `GLOSA=${sendResult.glosa ?? "(sin glosa)"} ` +
        `HTTP=${sendResult.httpStatus}`,
    };
  }

  if (!sendResult.trackId) {
    return {
      success: false,
      aecXml: aecXmlBuffer,
      status: sendResult.status,
      rawResponse: sendResult.rawXml,
      error:
        `SII OK pero sin TRACKID. STATUS=${sendResult.status ?? "?"}. ` +
        `Body (head): ${sendResult.rawXml.slice(0, 300)}`,
    };
  }

  return {
    success: true,
    trackId: sendResult.trackId,
    aecXml: aecXmlBuffer,
    status: sendResult.status,
    rawResponse: sendResult.rawXml,
  };
}
