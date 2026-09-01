import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { tableToExcelBuffer } from "@/modules/reportes-dt/export-excel";
import { CHILE_TZ } from "@/lib/dates-cl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UI_PAGE_SIZE = 200;
const XLSX_BATCH = 1_000;
const XLSX_MAX_ROWS = 50_000;

const COLUMNS = [
  { key: "checkedAtChile", label: "Fecha/hora (Chile)" },
  { key: "referenceSource", label: "Fuente" },
  { key: "referenceTime", label: "Hora referencia UTC" },
  { key: "serverTime", label: "Hora servidor UTC" },
  { key: "rttMs", label: "RTT ms" },
  { key: "driftMs", label: "Desfase ms" },
  { key: "status", label: "Estado" },
];

function mapRow(r: {
  id: string;
  checkedAt: Date;
  referenceSource: string;
  referenceTime: Date | null;
  serverTime: Date;
  rttMs: number | null;
  driftMs: number | null;
  status: string;
}) {
  return {
    id: r.id,
    checkedAt: r.checkedAt.toISOString(),
    checkedAtChile: formatInTimeZone(r.checkedAt, CHILE_TZ, "yyyy-MM-dd HH:mm:ss"),
    referenceSource: r.referenceSource,
    referenceTime: r.referenceTime?.toISOString() ?? "",
    serverTime: r.serverTime.toISOString(),
    rttMs: r.rttMs,
    driftMs: r.driftMs,
    status: r.status,
  };
}

function buildWhere(from: string | null, to: string | null) {
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
  return where;
}

export async function GET(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const format = (sp.get("format") || "json").toLowerCase();
  const cursor = sp.get("cursor");
  const where = buildWhere(from, to);
  const orderBy = [{ checkedAt: "desc" as const }, { id: "desc" as const }];

  if (format === "xlsx") {
    const data: ReturnType<typeof mapRow>[] = [];
    let batchCursor: string | undefined;
    for (;;) {
      const batch = await prisma.opsTimeSyncLog.findMany({
        where,
        orderBy,
        take: XLSX_BATCH,
        ...(batchCursor ? { cursor: { id: batchCursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      data.push(...batch.map(mapRow));
      if (data.length > XLSX_MAX_ROWS) {
        return NextResponse.json(
          {
            success: false,
            error: `El periodo supera ${XLSX_MAX_ROWS.toLocaleString("es-CL")} filas. Acota el filtro de fechas e inténtalo de nuevo.`,
          },
          { status: 413 },
        );
      }
      batchCursor = batch[batch.length - 1]?.id;
      if (batch.length < XLSX_BATCH) break;
    }

    const buf = await tableToExcelBuffer(
      "Sincronización horaria",
      COLUMNS,
      data as Record<string, unknown>[],
    );
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="sincronizacion-horaria.xlsx"',
      },
    });
  }

  const [total, rows] = await Promise.all([
    prisma.opsTimeSyncLog.count({ where }),
    prisma.opsTimeSyncLog.findMany({
      where,
      orderBy,
      take: UI_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  ]);

  const hasMore = rows.length > UI_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, UI_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return NextResponse.json({
    success: true,
    data: page.map(mapRow),
    total,
    limit: UI_PAGE_SIZE,
    nextCursor,
  });
}
