/**
 * GET /api/ops/guardias/[id]/marcaciones?year=YYYY&month=MM
 * Devuelve marcaciones del guardia en el mes dado + estadísticas.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getDaysInMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "America/Santiago";
type Params = { id: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const now = toZonedTime(new Date(), TZ);
    const year = parseInt(sp.get("year") ?? String(now.getFullYear()), 10);
    const month = parseInt(sp.get("month") ?? String(now.getMonth() + 1), 10);

    // Guardar start/end en UTC para la query
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: {
        guardiaId: id,
        tenantId: ctx.tenantId,
        timestamp: { gte: start, lte: end },
        deletedAt: null,
      },
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        metodoId: true,
        gpsStatus: true,
        atrasoMinutos: true,
        isModified: true,
        modifiedAt: true,
        modificationReason: true,
        opposedAt: true,
        consolidatedAt: true,
        installation: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: "asc" },
    });

    // Estadísticas del mes
    const entradas = marcaciones.filter((m) => m.tipo === "entrada");
    const salidas = marcaciones.filter((m) => m.tipo === "salida");
    const modificadas = marcaciones.filter((m) => m.isModified);
    const conAtraso = entradas.filter((m) => (m.atrasoMinutos ?? 0) > 0);
    const fuera = marcaciones.filter((m) => m.gpsStatus === "fuera_rango");

    return NextResponse.json({
      success: true,
      data: {
        marcaciones: marcaciones.map((m) => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
          modifiedAt: m.modifiedAt?.toISOString() ?? null,
          opposedAt: m.opposedAt?.toISOString() ?? null,
          consolidatedAt: m.consolidatedAt?.toISOString() ?? null,
        })),
        stats: {
          totalEntradas: entradas.length,
          totalSalidas: salidas.length,
          diasConMarcacion: new Set(
            marcaciones.map((m) =>
              new Date(m.timestamp).toISOString().slice(0, 10)
            )
          ).size,
          diasEnMes: getDaysInMonth(new Date(year, month - 1)),
          conAtraso: conAtraso.length,
          modificadas: modificadas.length,
          fueraDeRango: fuera.length,
        },
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching guardia marcaciones:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
