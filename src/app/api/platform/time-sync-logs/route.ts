import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { tableToExcelBuffer } from "@/modules/reportes-dt/export-excel";
import { CHILE_TZ } from "@/lib/dates-cl";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const format = (sp.get("format") || "json").toLowerCase();

  const where: { checkedAt?: { gte?: Date; lte?: Date } } = {};
  if (from || to) {
    where.checkedAt = {};
    if (from && YMD.test(from)) {
      where.checkedAt.gte = fromZonedTime(`${from}T00:00:00`, CHILE_TZ);
    }
    if (to && YMD.test(to)) {
      where.checkedAt.lte = fromZonedTime(`${to}T23:59:59.999`, CHILE_TZ);
    }
  }

  const rows = await prisma.opsTimeSyncLog.findMany({
    where,
    orderBy: { checkedAt: "desc" },
    take: 2000,
  });

  const data = rows.map((r) => ({
    id: r.id,
    checkedAt: r.checkedAt.toISOString(),
    checkedAtChile: formatInTimeZone(r.checkedAt, CHILE_TZ, "yyyy-MM-dd HH:mm:ss"),
    referenceSource: r.referenceSource,
    referenceTime: r.referenceTime?.toISOString() ?? "",
    serverTime: r.serverTime.toISOString(),
    rttMs: r.rttMs,
    driftMs: r.driftMs,
    status: r.status,
  }));

  if (format === "xlsx") {
    const buf = await tableToExcelBuffer(
      "Sincronización horaria",
      [
        { key: "checkedAtChile", label: "Fecha/hora (Chile)" },
        { key: "referenceSource", label: "Fuente" },
        { key: "referenceTime", label: "Hora referencia UTC" },
        { key: "serverTime", label: "Hora servidor UTC" },
        { key: "rttMs", label: "RTT ms" },
        { key: "driftMs", label: "Desfase ms" },
        { key: "status", label: "Estado" },
      ],
      data as Record<string, unknown>[],
    );
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="sincronizacion-horaria.xlsx"',
      },
    });
  }

  return NextResponse.json({ success: true, data });
}
