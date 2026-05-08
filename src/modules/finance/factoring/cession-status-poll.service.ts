/**
 * Service de polling de estados RPETC para cesiones SUBMITTED.
 * Bloque 9 v3 — invocado por el cron horario.
 *
 * NO auto-aprueba a 24h. Solo confirma con SII real.
 * NO auto-cancela tras rechazo. Marca cessionStatusError para que el
 * operador revise manualmente.
 * Después de 14 días sin EOK, marca el campo error con un mensaje
 * accionable pero deja la operación en SUBMITTED.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isProviderAecReferenceUrl,
  mergeCessionRpetcRaw,
} from "./cession-trace.util";
import { checkAecStatus } from "./sii-soap.service";

const MAX_AGE_DAYS_BEFORE_FLAG = 14;

export interface PollResult {
  tenantId: string;
  candidates: number;
  accepted: number;
  rejected: number;
  stillInProgress: number;
  abandoned: number;
  errors: string[];
}

/**
 * Itera sobre las cesiones SUBMITTED del tenant con TrackId y consulta
 * el estado real al SII. Aplica updates según la respuesta.
 */
export async function pollCessionsForTenant(tenantId: string): Promise<PollResult> {
  const result: PollResult = {
    tenantId,
    candidates: 0,
    accepted: 0,
    rejected: 0,
    stillInProgress: 0,
    abandoned: 0,
    errors: [],
  };
  const now = new Date();
  const flagBefore = new Date(
    now.getTime() - MAX_AGE_DAYS_BEFORE_FLAG * 86400 * 1000,
  );

  const candidates = await prisma.financeFactoringOperation.findMany({
    where: {
      tenantId,
      status: "SUBMITTED",
      cessionMethod: "ELECTRONIC",
      aecTrackId: { not: null },
    },
    select: {
      id: true,
      code: true,
      aecTrackId: true,
      submittedAt: true,
      cessionRpetcRaw: true,
    },
  });
  const soapCandidates = candidates.filter(
    (op) => op.aecTrackId && !isProviderAecReferenceUrl(op.aecTrackId),
  );
  result.candidates = soapCandidates.length;
  if (soapCandidates.length === 0) return result;

  for (const op of soapCandidates) {
    if (!op.aecTrackId) continue;
    try {
      const status = await checkAecStatus(tenantId, op.aecTrackId);
      const soapPayload: Record<string, unknown> = {
        lastSoapConsulta: {
          estadoEnvio: status.estadoEnvio,
          descEstado: status.descEstado,
          checkedAt: now.toISOString(),
          rawXml: jsonSafeXmlForTrace(status.rawXml),
        },
      };
      const update: Prisma.FinanceFactoringOperationUpdateInput = {
        cessionLastCheckedAt: now,
        cessionSiiStatus: status.estadoEnvio,
        cessionRpetcRaw: mergeCessionRpetcRaw(op.cessionRpetcRaw, soapPayload),
      };

      if (status.isAccepted) {
        update.status = "APPROVED";
        update.approvedAt = now;
        update.cessionStatusError = null;
        result.accepted += 1;
      } else if (status.isRejected) {
        update.cessionStatusError = `SII rechazó (${status.estadoEnvio}): ${status.descEstado}`;
        result.rejected += 1;
        // No cambia status a CANCELLED automático — requiere acción humana.
      } else if (status.isInProgress) {
        update.cessionStatusError = null;
        result.stillInProgress += 1;
      }

      // Después de 14 días sin EOK, flaggear con un mensaje accionable
      // (sin cambiar el status, para que el operador decida).
      if (op.submittedAt && op.submittedAt < flagBefore && !status.isAccepted) {
        update.cessionStatusError =
          `Sin confirmación SII después de ${MAX_AGE_DAYS_BEFORE_FLAG} días. ` +
          `Estado actual: ${status.estadoEnvio || "desconocido"}. ` +
          `Revisar manualmente en el portal del SII.`;
        result.abandoned += 1;
      }

      await prisma.financeFactoringOperation.update({
        where: { id: op.id },
        data: update,
      });
    } catch (err) {
      result.errors.push(`${op.code}: ${(err as Error).message}`);
    }
  }
  return result;
}

const MAX_TRACE_XML = 120_000;

function jsonSafeXmlForTrace(rawXml: string | undefined): string | null {
  if (rawXml == null || rawXml.length === 0) return null;
  if (rawXml.length <= MAX_TRACE_XML) return rawXml;
  return rawXml.slice(0, MAX_TRACE_XML) + "\n<!-- TRUNCATED -->";
}
