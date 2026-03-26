import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

/**
 * GET /api/ops/rondas/reportes/dashboard-rango
 * Returns per-installation, per-day compliance summaries for a date range.
 * Query params:
 *   desde  – start date YYYY-MM-DD (required)
 *   hasta  – end date YYYY-MM-DD (required)
 *   cicloInicio – operational cycle start hour (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const nowCL = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const desde = sp.get("desde") ?? nowCL;
    const hasta = sp.get("hasta") ?? nowCL;
    const cicloInicio = parseInt(sp.get("cicloInicio") ?? "20", 10);

    // Build array of dates in range
    const fechas: string[] = [];
    const dStart = new Date(desde + "T00:00:00");
    const dEnd = new Date(hasta + "T00:00:00");
    for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
      fechas.push(d.toISOString().slice(0, 10));
    }

    // Limit to 31 days max
    if (fechas.length > 31) {
      return NextResponse.json(
        { success: false, error: "Rango máximo de 31 días" },
        { status: 400 },
      );
    }

    // Full cycle range: first date at cicloInicio -> last date +1 day at cicloInicio
    const cycleStart = new Date(
      `${fechas[0]}T${String(cicloInicio).padStart(2, "0")}:00:00`,
    );
    const cycleEnd = new Date(
      `${fechas[fechas.length - 1]}T${String(cicloInicio).padStart(2, "0")}:00:00`,
    );
    cycleEnd.setDate(cycleEnd.getDate() + 1);

    const rows = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        scheduledAt: { gte: cycleStart, lt: cycleEnd },
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        installationId: true,
        installation: { select: { id: true, name: true } },
        rondaTemplate: {
          select: {
            installationId: true,
            installation: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Determine which date (cycle day) each row belongs to
    function getCycleDate(scheduledAt: Date): string {
      // Each cycle day starts at cicloInicio and ends +24h
      for (const fecha of fechas) {
        const start = new Date(
          `${fecha}T${String(cicloInicio).padStart(2, "0")}:00:00`,
        );
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        if (scheduledAt >= start && scheduledAt < end) return fecha;
      }
      return fechas[fechas.length - 1]; // fallback
    }

    // Map: installationId -> { name, days: { fecha -> { total, completadas } } }
    const instMap = new Map<
      string,
      {
        name: string;
        days: Map<string, { total: number; completadas: number }>;
      }
    >();

    for (const row of rows) {
      const instId =
        row.installationId ?? row.rondaTemplate?.installationId ?? "sin-instalacion";
      const instName =
        row.installation?.name ??
        row.rondaTemplate?.installation?.name ??
        "Sin instalación";
      const fecha = getCycleDate(row.scheduledAt);

      if (!instMap.has(instId)) {
        instMap.set(instId, { name: instName, days: new Map() });
      }
      const inst = instMap.get(instId)!;
      if (!inst.days.has(fecha)) {
        inst.days.set(fecha, { total: 0, completadas: 0 });
      }
      const day = inst.days.get(fecha)!;
      day.total++;
      if (row.status === "completada") day.completadas++;
    }

    // Build response
    const instalaciones = Array.from(instMap.entries())
      .map(([installationId, inst]) => {
        const dias: Record<string, { total: number; completadas: number; porcentaje: number }> = {};
        for (const fecha of fechas) {
          const day = inst.days.get(fecha);
          if (day) {
            dias[fecha] = {
              total: day.total,
              completadas: day.completadas,
              porcentaje: day.total > 0 ? Math.round((day.completadas / day.total) * 100) : 0,
            };
          } else {
            dias[fecha] = { total: 0, completadas: 0, porcentaje: 0 };
          }
        }
        // Overall totals
        let totalGeneral = 0;
        let completadasGeneral = 0;
        for (const d of Object.values(dias)) {
          totalGeneral += d.total;
          completadasGeneral += d.completadas;
        }
        return {
          installationId,
          installationName: inst.name,
          dias,
          resumen: {
            total: totalGeneral,
            completadas: completadasGeneral,
            porcentaje: totalGeneral > 0 ? Math.round((completadasGeneral / totalGeneral) * 100) : 0,
          },
        };
      })
      .sort((a, b) => a.resumen.porcentaje - b.resumen.porcentaje);

    // Global totals per day
    const totalesPorDia: Record<string, { total: number; completadas: number; porcentaje: number }> = {};
    for (const fecha of fechas) {
      let total = 0;
      let completadas = 0;
      for (const inst of instalaciones) {
        total += inst.dias[fecha].total;
        completadas += inst.dias[fecha].completadas;
      }
      totalesPorDia[fecha] = {
        total,
        completadas,
        porcentaje: total > 0 ? Math.round((completadas / total) * 100) : 0,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        desde,
        hasta,
        fechas,
        instalaciones,
        totalesPorDia,
      },
    });
  } catch (error) {
    console.error("[RONDAS] dashboard-rango", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
