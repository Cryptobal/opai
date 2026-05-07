/**
 * Servicio: Acuse de Recibo / Aceptación / Reclamo de DTEs RECIBIDOS
 *
 * Orquesta la operación end-to-end:
 *   1. Carga config DTE + certificado del tenant.
 *   2. Valida que el DTE recibido exista, sea del tenant, y todavía esté
 *      en plazo legal (8 días corridos desde la recepción según SII).
 *   3. Llama a SimpleAPI para notificar la acción al SII.
 *   4. Persiste el resultado en `FinanceDte`:
 *        - `receptionStatus` (ACCEPTED | CLAIMED | PARTIAL_CLAIM)
 *        - `receptionDecidedAt` (timestamp del acuse)
 *        - `receptionDecidedBy` (user que ejecutó la acción)
 *        - `claimType` (cuando aplica: 1=RCD, 3=RFP, 4=RFT por convención
 *           del enum SimpleSDK `TipoAceptacion`)
 *        - `notes` (append con metadata de SII para auditoría)
 *
 * Si SimpleAPI falla, NO se actualiza la DB y se devuelve el error al
 * caller para mostrarlo al usuario. El estado en SII y en OPAI quedan
 * consistentes (ambos "pendiente").
 *
 * IMPORTANTE: este flujo NO es reversible. Una vez aceptado/reclamado en
 * el SII, el cambio queda firme. Por eso validamos con dureza y solo
 * aceptamos cambios desde estado PENDING_REVIEW (no se puede "des-aceptar"
 * ni cambiar de aceptado a reclamado vía OPAI; eso requiere intervención
 * directa en el portal del SII).
 */

import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import {
  acuseRecibidoSimpleApi,
  acceptAndAcknowledge,
  type AcuseAccion,
} from "@/modules/finance/shared/adapters/simpleapi-acuse";
import type { SimpleApiAuth } from "@/modules/finance/shared/adapters/simpleapi-http";
import type { FinanceReceptionStatus } from "@prisma/client";

/**
 * Acción de alto nivel que puede pedir la UI:
 *   - "ACCEPT" → ACD + ERM (acepta y habilita uso de crédito IVA).
 *   - "ACCEPT_CONTENT_ONLY" → solo ACD (sin acuse de mercaderías).
 *   - "CLAIM_CONTENT" → RCD (rechazo del contenido del documento).
 *   - "CLAIM_PARTIAL" → RFP (faltan parcialmente las mercaderías).
 *   - "CLAIM_TOTAL" → RFT (no se recibieron las mercaderías).
 */
export type AcuseUserAction =
  | "ACCEPT"
  | "ACCEPT_CONTENT_ONLY"
  | "CLAIM_CONTENT"
  | "CLAIM_PARTIAL"
  | "CLAIM_TOTAL";

/**
 * Convención `claimType` de OPAI alineada con el enum oficial del SDK
 * Chilesystems `TipoAceptacion`:
 *   ACD=0, RCD=1, ERM=2, RFP=3, RFT=4
 * Se persiste solo cuando la acción es un reclamo (RCD/RFP/RFT). Para
 * aceptación (ACD+ERM) el campo queda NULL.
 */
const CLAIM_TYPE_BY_ACTION: Record<AcuseAccion, number | null> = {
  ACD: null,
  ERM: null,
  RCD: 1,
  RFP: 3,
  RFT: 4,
};

/**
 * Mapea acción de usuario → estado final esperado del DTE en OPAI tras
 * el acuse exitoso.
 */
const RECEPTION_STATUS_BY_ACTION: Record<
  AcuseUserAction,
  FinanceReceptionStatus
> = {
  ACCEPT: "ACCEPTED",
  ACCEPT_CONTENT_ONLY: "ACCEPTED",
  CLAIM_CONTENT: "CLAIMED",
  CLAIM_PARTIAL: "PARTIAL_CLAIM",
  CLAIM_TOTAL: "CLAIMED",
};

export interface AcuseServiceInput {
  /** ID del FinanceDte recibido. */
  dteId: string;
  /** Acción solicitada por el usuario (alto nivel). */
  action: AcuseUserAction;
  /** Texto opcional explicando el reclamo (solo para CLAIM_*). */
  reason?: string;
}

export interface AcuseServiceResult {
  success: boolean;
  /** Mensaje human-readable del resultado (éxito o error). */
  message: string;
  /** TrackId del SII si SimpleAPI lo devolvió. */
  trackId?: string;
  /** Estado final del DTE en OPAI tras la operación. */
  newReceptionStatus?: FinanceReceptionStatus;
  /** Detalles para auditoría / debugging. */
  raw?: unknown;
}

/**
 * Ejecuta el acuse contra el SII vía SimpleAPI y persiste el resultado.
 *
 * @param tenantId  Tenant del DTE (validado vs el DTE).
 * @param userId    Quien ejecuta la acción (queda en `receptionDecidedBy`).
 * @param input     Acción a ejecutar.
 */
export async function applyAcuse(
  tenantId: string,
  userId: string,
  input: AcuseServiceInput,
): Promise<AcuseServiceResult> {
  // ─── 1. Validar DTE ───
  const dte = await prisma.financeDte.findFirst({
    where: { id: input.dteId, tenantId, direction: "RECEIVED" },
    select: {
      id: true,
      dteType: true,
      folio: true,
      issuerRut: true,
      issuerName: true,
      receptionStatus: true,
      receptionDeadline: true,
      notes: true,
    },
  });
  if (!dte) {
    return {
      success: false,
      message: "DTE recibido no encontrado o no pertenece a este tenant.",
    };
  }

  // Solo aceptamos transición desde PENDING_REVIEW. El resto de estados
  // ya tomaron una decisión final (que se replicó en SII), no se puede
  // sobreescribir desde OPAI.
  if (dte.receptionStatus && dte.receptionStatus !== "PENDING_REVIEW") {
    return {
      success: false,
      message:
        `Este DTE ya tiene estado ${dte.receptionStatus} y no se puede modificar desde OPAI. ` +
        `Cualquier cambio requiere intervención directa en el portal del SII.`,
    };
  }

  // Plazo legal SII: 8 días corridos desde la recepción. Si pasó el
  // plazo, el SII puede rechazar el acuse. Lo mostramos como warning,
  // no bloqueante (algunas acciones pueden seguir aceptándose).
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const deadlineExpired =
    dte.receptionDeadline && dte.receptionDeadline < today;

  // ─── 2. Cargar config + cert del tenant ───
  const [config, cert] = await Promise.all([
    prisma.tenantDteConfig.findUnique({ where: { tenantId } }),
    prisma.tenantDteCertificate.findUnique({ where: { tenantId } }),
  ]);
  if (!config?.isActive) {
    return {
      success: false,
      message:
        "El tenant no tiene configuración DTE activa. Configurala en /opai/configuracion/finanzas/dte antes de acusar al SII.",
    };
  }
  if (!cert) {
    return {
      success: false,
      message:
        "El tenant no tiene certificado digital cargado. Subilo en /opai/configuracion/finanzas/dte antes de acusar al SII.",
    };
  }
  if (cert.notAfter < new Date()) {
    return {
      success: false,
      message: `El certificado digital está vencido (${cert.notAfter
        .toISOString()
        .split("T")[0]}). Renová el certificado antes de acusar al SII.`,
    };
  }

  let pfxBuffer: Buffer;
  let pfxPassword: string;
  try {
    pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    pfxPassword = decryptString(cert.passwordEnc);
  } catch (err) {
    return {
      success: false,
      message: `No se pudo descifrar el certificado digital: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  // El provider puede tener apiKey/baseUrl override desde Platform; acá
  // dejamos NULL para que `simpleapi-http` use las env vars (modo legacy
  // que ya está funcionando con el cron RCV).
  const auth: SimpleApiAuth = { apiKey: null, baseUrl: null };
  const ctx = {
    auth,
    environment: config.environment as "CERTIFICATION" | "PRODUCTION",
    pfxBuffer,
    pfxPassword,
    rutTitular: cert.rutTitular,
    rutEmpresa: config.emisorRut,
  };

  // ─── 3. Disparar acción contra SimpleAPI ───
  let success = false;
  let message = "";
  let trackId: string | undefined;
  let raw: unknown;
  let acuseAction: AcuseAccion; // acción "primaria" para `claimType`

  if (input.action === "ACCEPT") {
    acuseAction = "ACD";
    const result = await acceptAndAcknowledge(
      { dteType: dte.dteType, folio: dte.folio },
      ctx,
    );
    success = result.success;
    message = result.success
      ? "DTE aceptado y acuse de mercaderías entregado al SII. Se habilitó el uso del crédito IVA."
      : result.error ?? "Error desconocido al aceptar al SII.";
    trackId = result.ermResult?.trackId ?? result.acdResult.trackId;
    raw = { acdResult: result.acdResult, ermResult: result.ermResult };
  } else {
    const accion: AcuseAccion =
      input.action === "ACCEPT_CONTENT_ONLY"
        ? "ACD"
        : input.action === "CLAIM_CONTENT"
          ? "RCD"
          : input.action === "CLAIM_PARTIAL"
            ? "RFP"
            : /* CLAIM_TOTAL */ "RFT";
    acuseAction = accion;
    const result = await acuseRecibidoSimpleApi(
      { dteType: dte.dteType, folio: dte.folio, accion },
      ctx,
    );
    success = result.success;
    message = result.success
      ? `Acción ${accion} notificada al SII correctamente.`
      : result.error ?? `Error desconocido al notificar ${accion} al SII.`;
    trackId = result.trackId;
    raw = result;
  }

  // ─── 4. Persistir resultado en DB (solo si SimpleAPI confirmó) ───
  if (!success) {
    return { success: false, message, raw };
  }

  const newStatus = RECEPTION_STATUS_BY_ACTION[input.action];
  const decidedAt = new Date();
  // Append a `notes` con metadata del acuse para auditoría. Mantenemos
  // las notas previas concatenadas con un separador.
  const auditLine =
    `[${decidedAt.toISOString()}] SII ${acuseAction} por ${userId}` +
    (trackId ? ` (TrackId: ${trackId})` : "") +
    (input.reason ? ` — ${input.reason}` : "") +
    (deadlineExpired ? " — ⚠ FUERA DE PLAZO" : "");
  const newNotes = dte.notes ? `${dte.notes}\n${auditLine}` : auditLine;

  await prisma.financeDte.update({
    where: { id: dte.id },
    data: {
      receptionStatus: newStatus,
      receptionDecidedAt: decidedAt,
      receptionDecidedBy: userId,
      claimType: CLAIM_TYPE_BY_ACTION[acuseAction],
      notes: newNotes,
    },
  });

  return {
    success: true,
    message,
    trackId,
    newReceptionStatus: newStatus,
    raw,
  };
}
