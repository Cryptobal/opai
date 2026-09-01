/**
 * GET /api/public/hora-servidor
 * Hora del servidor + última verificación de desfase (Res. Ex. N°38 Art. 11).
 */

import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getAppVersion } from "@/lib/app-version";
import { CHILE_TZ } from "@/lib/dates-cl";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`public-hora-servidor:${ip}`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Demasiados intentos" }, { status: 429 });
  }

  const now = new Date();
  let last: Awaited<ReturnType<typeof prisma.opsTimeSyncLog.findFirst>> = null;
  try {
    last = await prisma.opsTimeSyncLog.findFirst({
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.warn("[hora-servidor] No se pudo leer OpsTimeSyncLog", err);
  }

  return NextResponse.json(
    {
      success: true,
      serverTimeUtc: now.toISOString(),
      serverTimeChile: formatInTimeZone(now, CHILE_TZ, "yyyy-MM-dd HH:mm:ss"),
      timezone: CHILE_TZ,
      lastCheck: last
        ? {
            checkedAt: last.checkedAt.toISOString(),
            referenceSource: last.referenceSource,
            referenceTime: last.referenceTime?.toISOString() ?? null,
            driftMs: last.driftMs,
            status: last.status,
          }
        : null,
      softwareVersion: getAppVersion(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
