import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly } from "@/lib/ops";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guardiaId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { guardiaId } = await params;
    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");

    const now = new Date();
    const from = fromRaw ? parseDateOnly(fromRaw) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = toRaw ? parseDateOnly(toRaw) : now;

    const absences = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        plannedGuardiaId: guardiaId,
        attendanceStatus: "no_asistio",
        date: { gte: from, lte: to },
      },
      select: {
        id: true,
        date: true,
        installation: { select: { name: true } },
        puesto: { select: { name: true } },
        plannedShiftStart: true,
        plannedShiftEnd: true,
      },
      orderBy: { date: "desc" },
    });

    const items = absences.map((a) => ({
      id: a.id,
      date: a.date,
      installation: a.installation.name,
      puesto: a.puesto.name,
      shift: `${a.plannedShiftStart ?? "?"} – ${a.plannedShiftEnd ?? "?"}`,
    }));

    return NextResponse.json({ success: true, data: { guardiaId, items } });
  } catch (error) {
    console.error("[OPS] Error fetching absence detail:", error);
    return NextResponse.json({ success: false, error: "Error obteniendo detalle de faltas" }, { status: 500 });
  }
}
