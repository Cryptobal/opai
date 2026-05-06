/**
 * /api/cron/finance-recurring-billing
 *
 * Ejecuta diariamente. Para cada tenant con módulo finance habilitado
 * (TenantDteConfig.isActive), llama processDueTemplates(tenantId).
 *
 * Idempotente: si lastRunAt = today los templates se saltan. Genera
 * BORRADORES (siiStatus=DRAFT) — nunca emite directo al SII.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processDueTemplates } from "@/modules/finance/billing/dte-recurring.service";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const configs = await prisma.tenantDteConfig.findMany({
    where: { isActive: true },
    select: { tenantId: true },
  });

  const results = [];
  for (const c of configs) {
    try {
      const r = await processDueTemplates(c.tenantId);
      results.push({ tenantId: c.tenantId, ...r });
    } catch (err) {
      results.push({
        tenantId: c.tenantId,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        error: (err as Error).message,
      });
    }
  }

  const totalSuccess = results.reduce((a, r) => a + r.successCount, 0);
  const totalFailed = results.reduce((a, r) => a + r.failedCount, 0);
  const totalSkipped = results.reduce((a, r) => a + r.skippedCount, 0);
  const elapsedMs = Date.now() - startedAt.getTime();

  console.log(
    `[finance-recurring-billing] tenants=${configs.length} success=${totalSuccess} failed=${totalFailed} skipped=${totalSkipped} elapsed=${elapsedMs}ms`,
  );

  return NextResponse.json({
    success: true,
    data: { tenantsProcessed: configs.length, totalSuccess, totalFailed, totalSkipped, elapsedMs, results },
  });
}
