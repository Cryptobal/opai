import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';
import { getOpsReportEmailFlags } from "@/lib/notifications/email-flags";

export async function GET() {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const turno = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, operatorId: ctx.userId, status: "active" },
    });
    if (!turno) {
      return NextResponse.json({ success: false, error: "Sin turno activo" }, { status: 404 });
    }

    const [roundsCount, alertsCount, opsEmails] = await Promise.all([
      prisma.opsRondaEjecucion.count({
        where: {
          tenantId: ctx.tenantId,
          completedAt: { gte: turno.startedAt },
        },
      }),
      prisma.opsAlertaRonda.count({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: turno.startedAt },
        },
      }),
      getOpsReportEmailFlags(ctx.tenantId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...turno,
        liveStats: { roundsCompleted: roundsCount, alertsGenerated: alertsCount },
      },
      opsEmails,
    });
  } catch (error) {
    console.error("[RONDAS] GET monitoreo turno active", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
