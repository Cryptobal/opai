import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const fecha = sp.get("fecha") ?? new Date().toISOString().slice(0, 10);
    const cicloInicio = parseInt(sp.get("cicloInicio") ?? "20", 10);

    // Operational cycle: fecha at cicloInicio hour -> next day at cicloInicio hour
    const cycleStart = new Date(`${fecha}T${String(cicloInicio).padStart(2, "0")}:00:00`);
    const cycleEnd = new Date(cycleStart.getTime() + 24 * 60 * 60 * 1000);

    const where = {
      tenantId: ctx.tenantId,
      scheduledAt: { gte: cycleStart, lt: cycleEnd },
    };

    const rows = await prisma.opsRondaEjecucion.findMany({
      where,
      include: {
        rondaTemplate: {
          select: {
            name: true,
            installationId: true,
            installation: { select: { id: true, name: true } },
          },
        },
        installation: { select: { id: true, name: true } },
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        marcaciones: {
          select: {
            id: true,
            checkpointId: true,
            timestamp: true,
            status: true,
            fotoEvidenciaUrl: true,
            audioUrl: true,
          },
          orderBy: { timestamp: "asc" as const },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Group rows by installation
    const installationMap = new Map<
      string,
      {
        installationId: string;
        installationName: string;
        rounds: typeof rows;
      }
    >();

    for (const row of rows) {
      const instId =
        row.installationId ?? row.rondaTemplate?.installationId ?? "sin-instalacion";
      const instName =
        row.installation?.name ??
        row.rondaTemplate?.installation?.name ??
        "Sin instalacion";

      if (!installationMap.has(instId)) {
        installationMap.set(instId, {
          installationId: instId,
          installationName: instName,
          rounds: [],
        });
      }
      installationMap.get(instId)!.rounds.push(row);
    }

    // Track per-guard stats for global summary
    const guardiaStats = new Map<
      string,
      { nombre: string; total: number; completadas: number; duraciones: number[] }
    >();

    // Build per-installation data
    const instalaciones = Array.from(installationMap.values()).map((inst) => {
      let total = 0;
      let completadas = 0;
      let incompletas = 0;
      let noRealizadas = 0;

      const rondas = inst.rounds.map((row) => {
        total++;
        if (row.status === "completada") completadas++;
        else if (row.status === "incompleta") incompletas++;
        else if (row.status === "no_realizada") noRealizadas++;

        const guardiaNombre = row.guardia
          ? formatPersonName(row.guardia.persona.firstName, row.guardia.persona.lastName)
          : "";

        // Track guard stats
        if (row.guardia) {
          const gId = row.guardiaId ?? row.guardia.id;
          if (!guardiaStats.has(gId)) {
            guardiaStats.set(gId, { nombre: guardiaNombre, total: 0, completadas: 0, duraciones: [] });
          }
          const gs = guardiaStats.get(gId)!;
          gs.total++;
          if (row.status === "completada") gs.completadas++;
          if (row.durationMinutes != null) gs.duraciones.push(row.durationMinutes);
        }

        const photos = row.marcaciones.filter((m) => !!m.fotoEvidenciaUrl).length;
        const audio = row.marcaciones.filter((m) => !!m.audioUrl).length;

        return {
          id: row.id,
          scheduledAt: row.scheduledAt.toISOString(),
          template: row.rondaTemplate?.name ?? (row.isAdHoc ? "Ronda Libre" : "Sin plantilla"),
          guardia: guardiaNombre,
          status: row.status,
          completion: {
            completados: row.checkpointsCompletados,
            total: row.checkpointsTotal,
            porcentaje: Math.round(row.porcentajeCompletado),
          },
          durationMinutes: row.durationMinutes ?? null,
          evidencia: { photos, audio },
          trustScore: row.trustScore,
        };
      });

      return {
        installationId: inst.installationId,
        installationName: inst.installationName,
        rondas,
        resumen: {
          total,
          completadas,
          incompletas,
          noRealizadas,
          porcentajeCumplimiento: total > 0 ? Math.round((completadas / total) * 100) : 0,
        },
      };
    });

    // Global summary
    const globalTotal = rows.length;
    const globalCompletadas = rows.filter((r) => r.status === "completada").length;
    const globalIncompletas = rows.filter((r) => r.status === "incompleta").length;
    const globalNoRealizadas = rows.filter((r) => r.status === "no_realizada").length;

    const instalacionesCriticas = instalaciones
      .filter((i) => i.resumen.porcentajeCumplimiento === 0 && i.resumen.total > 0)
      .map((i) => ({ installationId: i.installationId, installationName: i.installationName }));

    let mejorGuardia: { nombre: string; porcentaje: number; duracionPromedio: number | null } | null = null;
    let peorGuardia: { nombre: string; porcentaje: number } | null = null;

    if (guardiaStats.size > 0) {
      let bestPct = -1;
      let worstPct = 101;

      for (const [, gs] of guardiaStats) {
        const pct = gs.total > 0 ? Math.round((gs.completadas / gs.total) * 100) : 0;
        if (pct > bestPct) {
          bestPct = pct;
          const avgDur =
            gs.duraciones.length > 0
              ? Math.round(gs.duraciones.reduce((a, b) => a + b, 0) / gs.duraciones.length)
              : null;
          mejorGuardia = { nombre: gs.nombre, porcentaje: pct, duracionPromedio: avgDur };
        }
        if (pct < worstPct) {
          worstPct = pct;
          peorGuardia = { nombre: gs.nombre, porcentaje: pct };
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        fecha,
        ciclo: {
          inicio: cycleStart.toISOString(),
          fin: cycleEnd.toISOString(),
        },
        instalaciones,
        resumenGlobal: {
          totalRondas: globalTotal,
          completadas: globalCompletadas,
          incompletas: globalIncompletas,
          noRealizadas: globalNoRealizadas,
          porcentajeCumplimiento:
            globalTotal > 0 ? Math.round((globalCompletadas / globalTotal) * 100) : 0,
          instalacionesCriticas,
          mejorGuardia,
          peorGuardia,
        },
      },
    });
  } catch (error) {
    console.error("[RONDAS] dashboard-diario", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
