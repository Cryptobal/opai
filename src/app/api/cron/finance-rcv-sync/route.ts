/**
 * API Route: /api/cron/finance-rcv-sync
 * GET - Sync incremental RCV (Registro Compras) for all active tenants
 * with DTE config. Solo trae DTEs RECIBIDOS (los emitidos los gestiona
 * el usuario directamente desde la UI).
 *
 * Schedule: daily at 09:00 UTC (= 06:00 hora Chile en horario invierno).
 * Forzamos `monthsBack=1` para minimizar consultas SimpleAPI:
 *   - 1 consulta/día/tenant = ~30 consultas/mes
 *   - Cabe en plan Básico (100/mes) con 70 de margen para syncs manuales
 *
 * Protegido con CRON_SECRET env var.
 *
 * Detección de bloqueo: si el service retorna error con prefijo
 * API_KEY_QUOTA o API_KEY_RATE_LIMIT, se loguea con etiqueta clara
 * para que el operador sepa que la apikey de SimpleAPI está bloqueada
 * y necesita acción manual (subir plan o comprar Peticiones de Respaldo
 * en https://panel.simpleapi.cl/).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncTenantRcv } from "@/modules/finance/billing/rcv-sync.service";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startedAt = new Date();
  const configs = await prisma.tenantDteConfig.findMany({
    where: { isActive: true, provider: "SIMPLEAPI" },
    select: { tenantId: true, emisorRut: true },
  });

  const results: Array<
    Awaited<ReturnType<typeof syncTenantRcv>> & {
      apiKeyBlocked?: "QUOTA" | "RATE_LIMIT";
    }
  > = [];

  for (const c of configs) {
    try {
      // Forzamos monthsBack=1 (incremental ajustado al mes corriente).
      // Si lastRcvSyncAt está seteado, igualmente trae todo desde ahí
      // hasta hoy (el service maneja ambos casos).
      const r = await syncTenantRcv(c.tenantId, { monthsBack: 1 });

      // Detectar bloqueo de apikey en los errores devueltos por el service.
      const blockedQuota = r.errors.find((e) => e.startsWith("API_KEY_QUOTA"));
      const blockedRate = r.errors.find((e) => e.startsWith("API_KEY_RATE_LIMIT"));
      if (blockedQuota) {
        console.warn(
          `[finance-rcv-sync] ⚠ APIKEY_BLOCKED tenant=${c.tenantId} rut=${c.emisorRut}: ${blockedQuota}`,
        );
        results.push({ ...r, apiKeyBlocked: "QUOTA" });
      } else if (blockedRate) {
        console.warn(
          `[finance-rcv-sync] ⚠ RATE_LIMIT tenant=${c.tenantId} rut=${c.emisorRut}: ${blockedRate}`,
        );
        results.push({ ...r, apiKeyBlocked: "RATE_LIMIT" });
      } else {
        results.push(r);
      }
    } catch (err) {
      results.push({
        tenantId: c.tenantId,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: [(err as Error).message],
        monthsQueried: [],
      });
    }
    // Throttle entre tenants para respetar rate limit SimpleAPI
    // (1/sec, 5/min, 100/hora).
    await new Promise((r) => setTimeout(r, 1500));
  }

  const totalFetched = results.reduce((a, r) => a + r.fetched, 0);
  const totalInserted = results.reduce((a, r) => a + r.inserted, 0);
  const totalSkipped = results.reduce((a, r) => a + r.skipped, 0);
  const errored = results.filter((r) => r.errors.length > 0);
  const blocked = results.filter((r) => r.apiKeyBlocked);
  const elapsedMs = Date.now() - startedAt.getTime();

  console.log(
    `[finance-rcv-sync] tenants=${configs.length} fetched=${totalFetched} inserted=${totalInserted} skipped=${totalSkipped} errored=${errored.length} blocked=${blocked.length} elapsed=${elapsedMs}ms`,
  );

  return NextResponse.json({
    success: true,
    data: {
      tenantsProcessed: configs.length,
      totalFetched,
      totalInserted,
      totalSkipped,
      blockedTenants: blocked.length,
      elapsedMs,
      results,
    },
  });
}
