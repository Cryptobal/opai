import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10) || 20, 50);
    const offset = parseInt(sp.get("offset") ?? "0", 10) || 0;

    const defaultFrom = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days
    const from = sp.get("from") ? new Date(sp.get("from")!) : defaultFrom;
    const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();

    const where = {
      tenantId: ctx.tenantId,
      status: "completed",
      endedAt: { gte: from, lte: to },
    };

    const [turnos, total] = await Promise.all([
      prisma.opsMonitoreoTurno.findMany({
        where,
        orderBy: { endedAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          controlNocturno: {
            include: {
              instalaciones: {
                include: {
                  guardias: { orderBy: { createdAt: "asc" } },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
        },
      }),
      prisma.opsMonitoreoTurno.count({ where }),
    ]);

    const mapped = turnos.map((t) => ({
      id: t.id,
      startedAt: t.startedAt.toISOString(),
      endedAt: t.endedAt?.toISOString() ?? null,
      operatorName: t.operatorName,
      status: t.status,
      totalRoundsMonitored: t.totalRoundsMonitored,
      totalAlertsHandled: t.totalAlertsHandled,
      aiSummary: t.aiSummary,
      operatorComments: t.operatorComments,
      emailSentTo: t.emailSentTo as Record<string, unknown> | null,
      controlNocturno: t.controlNocturno
        ? {
            id: t.controlNocturno.id,
            date: t.controlNocturno.date.toISOString(),
            centralOperatorName: t.controlNocturno.centralOperatorName,
            centralLabel: t.controlNocturno.centralLabel,
            shiftStart: t.controlNocturno.shiftStart,
            shiftEnd: t.controlNocturno.shiftEnd,
            instalaciones: t.controlNocturno.instalaciones.map((inst) => ({
              id: inst.id,
              installationName: inst.installationName,
              guardiasRequeridos: inst.guardiasRequeridos,
              guardiasPresentes: inst.guardiasPresentes,
              coberturaStatus: inst.coberturaStatus,
              statusInstalacion: inst.statusInstalacion,
              notes: inst.notes,
              guardias: inst.guardias.map((g) => ({
                id: g.id,
                guardiaNombre: g.guardiaNombre,
                status: g.status,
                turno: g.turno,
                isExtra: g.isExtra,
                horaLlegada: g.horaLlegada,
                notes: g.notes,
              })),
            })),
          }
        : null,
    }));

    return NextResponse.json({ success: true, data: { turnos: mapped, total } });
  } catch (error) {
    console.error("[RONDAS] GET turno history", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
