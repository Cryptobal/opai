/**
 * Cron: consolidar marcaciones modificadas cuyo plazo de 48h venció
 * sin que el trabajador se oponga.
 *
 * Schedule: cada hora (vercel.json)
 * Auth: CRON_SECRET header
 *
 * A las 04:00 UTC (o `?vigencia=1`) aplica también el sync de vigencia
 * de asignaciones. No hay ruta `/api/cron/sync-asignaciones-vigencia`:
 * un 67.º cron rechaza el deploy de Vercel.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  runSyncAsignacionesVigencia,
  shouldRunVigenciaSync,
} from "@/lib/ops/sync-asignaciones-vigencia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const PLAZO_MS = 48 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - PLAZO_MS);

  // Marcaciones modificadas, con plazo vencido, sin oposición y sin consolidar
  const result = await prisma.opsMarcacion.updateMany({
    where: {
      isModified: true,
      modifiedAt: { lte: cutoff },
      opposedAt: null,
      consolidatedAt: null,
      deletedAt: null,
    },
    data: {
      consolidatedAt: new Date(),
    },
  });

  console.log(`[CRON] consolidar-marcaciones: ${result.count} consolidadas`);

  let vigencia: Awaited<ReturnType<typeof runSyncAsignacionesVigencia>> | null = null;
  const forceVigencia = req.nextUrl.searchParams.get("vigencia") === "1";
  if (shouldRunVigenciaSync(new Date(), forceVigencia)) {
    try {
      vigencia = await runSyncAsignacionesVigencia();
    } catch (error) {
      console.error("[OPS][CRON] sync-asignaciones-vigencia failed", error);
    }
  }

  return NextResponse.json({
    success: true,
    consolidated: result.count,
    ...(vigencia ? { vigencia } : {}),
  });
}
