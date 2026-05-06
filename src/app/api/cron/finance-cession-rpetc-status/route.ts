/**
 * Cron horario: consulta el estado RPETC de las cesiones SUBMITTED.
 * Bloque 9 v3 — registrado en vercel.json con schedule "0 * * * *".
 *
 * Auth: Bearer CRON_SECRET (igual que los demás crons del repo).
 * maxDuration: 300s (default Vercel post-2025).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollCessionsForTenant } from "@/modules/finance/factoring/cession-status-poll.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenantDteConfig.findMany({
    where: { isActive: true },
    select: { tenantId: true },
  });

  const results: Array<unknown> = [];
  for (const t of tenants) {
    try {
      const r = await pollCessionsForTenant(t.tenantId);
      results.push(r);
    } catch (err) {
      results.push({
        tenantId: t.tenantId,
        error: (err as Error).message,
      });
    }
  }
  return NextResponse.json({
    ok: true,
    processedTenants: tenants.length,
    results,
  });
}
