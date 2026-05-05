/**
 * API Route: /api/cron/finance-rcv-sync
 * GET - Sync RCV (Registro Compras) for all active tenants with DTE config.
 *
 * Schedule: daily at 09:00 UTC (= 06:00 hora Chile en horario invierno).
 * Protected with CRON_SECRET env var.
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

  const configs = await prisma.tenantDteConfig.findMany({
    where: { isActive: true, provider: "SIMPLEAPI" },
    select: { tenantId: true },
  });

  const results = [];
  for (const c of configs) {
    try {
      const r = await syncTenantRcv(c.tenantId);
      results.push(r);
    } catch (err) {
      results.push({
        tenantId: c.tenantId,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: [(err as Error).message],
      });
    }
    // Throttle to respect SimpleAPI RCV rate limit (1/sec, 5/min).
    await new Promise((r) => setTimeout(r, 1500));
  }

  const totalFetched = results.reduce((a, r) => a + r.fetched, 0);
  const totalInserted = results.reduce((a, r) => a + r.inserted, 0);
  const errored = results.filter((r) => r.errors.length > 0);

  console.log(
    `[finance-rcv-sync] ${configs.length} tenants, ${totalFetched} fetched, ${totalInserted} inserted, ${errored.length} with errors`
  );

  return NextResponse.json({
    success: true,
    data: {
      tenantsProcessed: configs.length,
      totalFetched,
      totalInserted,
      results,
    },
  });
}
