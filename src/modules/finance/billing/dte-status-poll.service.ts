/**
 * DTE Status Poll Service
 *
 * Consulta el estado SII de los DTEs emitidos pendientes de respuesta.
 * Diseñado para ser eficiente con el cupo de SimpleAPI (cron DIARIO):
 *
 *   - Solo consulta DTEs en estado SENT o PENDING (no los ACCEPTED/REJECTED)
 *   - Solo si fueron emitidos hace > 5 min (dar tiempo al SII)
 *   - Solo si NO se consultaron en las últimas 23h (siiLastStatusCheckAt)
 *     → el cron diario solo procesa DTEs que aún no se vieron en este "día"
 *   - Solo si checkCount < MAX_CHECKS (default 7 → 1 semana de polling)
 *   - Solo si tienen siiTrackId (necesario para consultar)
 *
 * Costo SimpleAPI por DTE en proceso típico:
 *   - Día 1: 1 consulta (SII suele responder antes del próximo cron)
 *   - Si tarda: 1 consulta más por día hasta 7 días máx
 *   - Total típico: 1-3 consultas/DTE
 *
 * Para Gard (~20 emisiones/día):
 *   - Cron diario procesa ~20 DTEs nuevos = 20 consultas/día
 *   - + Re-chequeo de DTEs que aún están pendientes (cap 50 por ejecución)
 *   - Costo típico: ~30-50 consultas/día = ~900-1500/mes
 *   - Plan Básico (1.500/mes) llega justo
 *   - Plan Estándar (5K/mes) cubre con margen amplio
 *
 * Para reducir aún más: subir MAX_CHECKS_PER_DTE a menor (ej. 5 → asume
 * rechazo silencioso después de 5 días) o aumentar MIN_INTERVAL.
 *
 * Detección de bloqueo: si SimpleAPI devuelve 401/402/403/429 o body
 * con "apikey bloqueada"/"rate limit", el service se detiene
 * inmediatamente y NO actualiza siiLastStatusCheckAt (para que el
 * próximo intento, una vez desbloqueado, retome desde el mismo DTE).
 */

import { prisma } from "@/lib/prisma";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";
import { sendDteRejectedAlert } from "./dte-rejected-alert.service";

/**
 * Tope de consultas SII por DTE antes de dar timeout (asume rechazo
 * silencioso). Con cron diario = 7 días de polling máximo.
 */
const MAX_CHECKS_PER_DTE = 7;
/**
 * Mínimo entre consultas del mismo DTE. 23h evita que dos ejecuciones
 * del cron diario ejecuten la misma consulta si hay drift de schedule
 * (Vercel puede ejecutar con ±15 min de variación).
 */
const MIN_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23 horas
/** Esperar al menos este tiempo desde la emisión antes de consultar. */
const MIN_AGE_MS = 5 * 60 * 1000; // 5 minutos
/** Máximo edad de DTE para seguir consultando (después se asume rechazo silencioso). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface DteStatusPollResult {
  tenantId: string;
  candidates: number;
  checked: number;
  updated: number;
  accepted: number;
  rejected: number;
  withObjections: number;
  stillPending: number;
  apiKeyBlocked: boolean;
  errors: string[];
}

export async function pollPendingDtesStatus(
  tenantId: string,
): Promise<DteStatusPollResult> {
  const result: DteStatusPollResult = {
    tenantId,
    candidates: 0,
    checked: 0,
    updated: 0,
    accepted: 0,
    rejected: 0,
    withObjections: 0,
    stillPending: 0,
    apiKeyBlocked: false,
    errors: [],
  };

  const now = new Date();
  const minAgeCutoff = new Date(now.getTime() - MIN_AGE_MS);
  const maxAgeCutoff = new Date(now.getTime() - MAX_AGE_MS);
  const checkCutoff = new Date(now.getTime() - MIN_INTERVAL_MS);

  // Candidatos: DTEs SENT/PENDING con trackId, edad entre 5min y 7d,
  // checkCount < MAX, y NO consultados en la última hora.
  const candidates = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      siiStatus: { in: ["PENDING", "SENT"] },
      siiTrackId: { not: null },
      createdAt: {
        lte: minAgeCutoff,
        gte: maxAgeCutoff,
      },
      OR: [
        { siiLastStatusCheckAt: null },
        { siiLastStatusCheckAt: { lte: checkCutoff } },
      ],
      siiStatusCheckCount: { lt: MAX_CHECKS_PER_DTE },
    },
    select: {
      id: true,
      siiTrackId: true,
      siiStatusCheckCount: true,
      folio: true,
      dteType: true,
    },
    orderBy: { createdAt: "asc" },
    take: 50, // tope de seguridad
  });

  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const provider = await getDteProvider(tenantId);

  for (const dte of candidates) {
    if (result.apiKeyBlocked) break; // abortar si ya detectamos bloqueo

    try {
      const status = await provider.getStatus(dte.siiTrackId!);
      result.checked++;

      // Detectar bloqueo apikey por mensajes típicos en `message`.
      const msg = (status.message ?? "").toLowerCase();
      if (
        msg.includes("apikey") || msg.includes("api key") ||
        msg.includes("bloqueada") || msg.includes("rate limit") ||
        msg.includes("too many requests") || msg.includes("límite mensual")
      ) {
        result.apiKeyBlocked = true;
        result.errors.push(
          `API_KEY_BLOCKED en DTE ${dte.dteType}-${dte.folio}: ${status.message}`,
        );
        // NO actualizamos lastStatusCheckAt: el próximo intento retoma.
        break;
      }

      // Mapear y persistir el estado nuevo.
      const newStatus = status.status; // ya viene normalizado por el provider
      const updateData: Record<string, unknown> = {
        siiLastStatusCheckAt: now,
        siiStatusCheckCount: dte.siiStatusCheckCount + 1,
      };
      // Solo actualizar siiStatus si cambió a algo definitivo (no SENT/PENDING).
      if (newStatus !== "PENDING" && newStatus !== "SENT") {
        updateData.siiStatus = newStatus;
        updateData.siiResponse = (status.rawResponse as Record<string, unknown>) ?? null;
        if (newStatus === "ACCEPTED" || newStatus === "WITH_OBJECTIONS") {
          updateData.siiAcceptedAt = now;
        }
        result.updated++;
        if (newStatus === "ACCEPTED") result.accepted++;
        else if (newStatus === "REJECTED") result.rejected++;
        else if (newStatus === "WITH_OBJECTIONS") result.withObjections++;
      } else {
        result.stillPending++;
      }

      await prisma.financeDte.update({
        where: { id: dte.id },
        data: updateData,
      });

      // Si el estado pasó a REJECTED, dispara alerta email a los
      // alertEmails configurados del tenant. Async, no bloquea el loop.
      if (newStatus === "REJECTED") {
        sendDteRejectedAlert(tenantId, dte.id).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(
            `[dte-status-poll] sendDteRejectedAlert failed for ${dte.id}:`,
            err,
          );
        });
      }

      // Throttle entre consultas (rate limit SimpleAPI 1/sec).
      await new Promise((r) => setTimeout(r, 1100));
    } catch (err) {
      result.errors.push(
        `DTE ${dte.dteType}-${dte.folio}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
