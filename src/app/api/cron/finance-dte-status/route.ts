/**
 * API Route: /api/cron/finance-dte-status
 * GET — Polling DIARIO del estado SII de DTEs emitidos pendientes.
 *
 * Para cada tenant con DTE activo, consulta los DTEs en estado SENT/PENDING
 * que cumplan ciertas condiciones (ver pollPendingDtesStatus) para
 * actualizar su siiStatus a ACCEPTED / REJECTED / WITH_OBJECTIONS
 * según lo que devuelve el SII vía SimpleAPI consulta/envio.
 *
 * Schedule: 1 vez por día a las 11:00 UTC (= 08:00 Chile invierno,
 * 07:00 Chile verano). Bajamos de horario a diario por solicitud del
 * usuario para reducir consumo de cupo SimpleAPI.
 *
 * Costo estimado por tenant:
 *   - 1 ejecución/día
 *   - Cap de 50 DTEs por ejecución
 *   - Cap de 7 chequeos por DTE (después timeout)
 *   - Para Gard (~20 DTEs/día): ~30-50 consultas/día = ~900-1500/mes
 *
 * Si necesitás respuesta más rápida del SII, usá el botón "Actualizar
 * estado SII" (icono RefreshCw) en cada fila de DTE — manual on-demand.
 *
 * Respeta el cupo SimpleAPI:
 *   - Solo consulta DTEs no chequeados en las últimas 23 horas
 *   - Cap de 7 chequeos por DTE (después se asume rechazo silencioso)
 *   - Solo DTEs con < 7 días de antigüedad
 *   - Si detecta bloqueo de apikey, aborta y no marca timestamp
 *     (próximo intento retoma desde el mismo DTE)
 *
 * Protegido con CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollPendingDtesStatus } from "@/modules/finance/billing/dte-status-poll.service";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = new Date();
  const configs = await prisma.tenantDteConfig.findMany({
    where: { isActive: true, provider: "SIMPLEAPI" },
    select: { tenantId: true, emisorRut: true },
  });

  const results = [];
  for (const c of configs) {
    try {
      const r = await pollPendingDtesStatus(c.tenantId);
      if (r.apiKeyBlocked) {
        console.warn(
          `[finance-dte-status] APIKEY_BLOCKED tenant=${c.tenantId} rut=${c.emisorRut}`,
        );
      }
      results.push(r);
    } catch (err) {
      results.push({
        tenantId: c.tenantId,
        candidates: 0,
        checked: 0,
        updated: 0,
        accepted: 0,
        rejected: 0,
        withObjections: 0,
        stillPending: 0,
        apiKeyBlocked: false,
        errors: [(err as Error).message],
      });
    }
    // Throttle entre tenants (no técnicamente necesario porque cada
    // pollPendingDtesStatus ya hace throttle interno, pero por seguridad).
    await new Promise((r) => setTimeout(r, 500));
  }

  const totalChecked = results.reduce((a, r) => a + r.checked, 0);
  const totalUpdated = results.reduce((a, r) => a + r.updated, 0);
  const totalAccepted = results.reduce((a, r) => a + r.accepted, 0);
  const totalRejected = results.reduce((a, r) => a + r.rejected, 0);
  const blocked = results.filter((r) => r.apiKeyBlocked);
  const elapsedMs = Date.now() - startedAt.getTime();

  console.log(
    `[finance-dte-status] tenants=${configs.length} checked=${totalChecked} updated=${totalUpdated} accepted=${totalAccepted} rejected=${totalRejected} blocked=${blocked.length} elapsed=${elapsedMs}ms`,
  );

  return NextResponse.json({
    success: true,
    data: {
      tenantsProcessed: configs.length,
      totalChecked,
      totalUpdated,
      totalAccepted,
      totalRejected,
      blockedTenants: blocked.length,
      elapsedMs,
      results,
    },
  });
}
