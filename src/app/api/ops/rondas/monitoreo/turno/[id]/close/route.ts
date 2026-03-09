import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { monitoreoTurnoCloseSchema } from "@/lib/validations/rondas";
import { sendMonitorTurnoEmail } from "@/lib/rondas/monitor-email";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const parsed = await parseBody(request, monitoreoTurnoCloseSchema);
    if (parsed.error) return parsed.error;

    const turno = await prisma.opsMonitoreoTurno.findFirst({
      where: { id, tenantId: ctx.tenantId, status: "active" },
    });
    if (!turno) {
      return NextResponse.json({ success: false, error: "Turno no encontrado o ya cerrado" }, { status: 404 });
    }

    // Only the operator who started the turno can close it
    if (turno.operatorId !== ctx.userId) {
      return NextResponse.json(
        { success: false, error: "Solo el operador del turno puede cerrarlo" },
        { status: 403 },
      );
    }

    const now = new Date();

    const [roundsData, alertsData] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where: {
          tenantId: ctx.tenantId,
          completedAt: { gte: turno.startedAt, lte: now },
        },
        include: {
          rondaTemplate: { select: { name: true, installation: { select: { name: true } } } },
        },
      }),
      prisma.opsAlertaRonda.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: turno.startedAt, lte: now },
        },
        select: {
          tipo: true, severidad: true, mensaje: true, installationId: true,
          resuelta: true, resolutionNotes: true, resueltaAt: true,
          installation: { select: { name: true } },
        },
      }),
    ]);

    const totalRounds = roundsData.length;
    const completadas = roundsData.filter(r => r.status === "completada").length;
    const incompletas = roundsData.filter(r => r.status === "incompleta").length;
    const trustAvg = totalRounds > 0
      ? Math.round(roundsData.reduce((s, r) => s + (r.trustScore ?? 0), 0) / totalRounds)
      : 0;
    const criticalAlerts = alertsData.filter(a => a.severidad === "critical").length;

    const resolvedAlerts = alertsData.filter(a => a.resuelta);
    const unresolvedAlerts = alertsData.filter(a => !a.resuelta);

    const summaryLines = [
      `Turno de monitoreo: ${turno.startedAt.toLocaleString("es-CL")} - ${now.toLocaleString("es-CL")}`,
      `Operador: ${turno.operatorName ?? ctx.userId}`,
      ``,
      `Rondas monitoreadas: ${totalRounds} (${completadas} completadas, ${incompletas} incompletas)`,
      `Trust Score promedio: ${trustAvg}/100`,
      `Alertas generadas: ${alertsData.length} (${criticalAlerts} críticas, ${resolvedAlerts.length} resueltas, ${unresolvedAlerts.length} pendientes)`,
    ];

    if (resolvedAlerts.length > 0) {
      summaryLines.push(``, `--- Alertas resueltas ---`);
      for (const a of resolvedAlerts) {
        const instName = a.installation?.name ?? "Sin instalación";
        summaryLines.push(`• [${a.severidad.toUpperCase()}] ${instName}: ${a.mensaje}`);
        if (a.resolutionNotes) {
          summaryLines.push(`  → Resolución: ${a.resolutionNotes}`);
        }
      }
    }

    if (unresolvedAlerts.length > 0) {
      summaryLines.push(``, `--- Alertas pendientes ---`);
      for (const a of unresolvedAlerts) {
        const instName = a.installation?.name ?? "Sin instalación";
        summaryLines.push(`• [${a.severidad.toUpperCase()}] ${instName}: ${a.mensaje}`);
      }
    }

    if (parsed.data.operatorComments) {
      summaryLines.push(``, `Comentarios del operador: ${parsed.data.operatorComments}`);
    }
    const aiSummary = summaryLines.join("\n");

    const updated = await prisma.opsMonitoreoTurno.update({
      where: { id },
      data: {
        status: "completed",
        endedAt: now,
        totalRoundsMonitored: totalRounds,
        totalAlertsHandled: alertsData.length,
        aiSummary,
        operatorComments: parsed.data.operatorComments ?? null,
        emailSentTo: parsed.data.emailRecipients ? (parsed.data.emailRecipients as any) : null,
        emailSentAt: parsed.data.emailRecipients?.length ? now : null,
      },
    });

    // If turno is linked to a CN in borrador, submit it automatically
    if (turno.controlNocturnoId) {
      prisma.opsControlNocturno.updateMany({
        where: {
          id: turno.controlNocturnoId,
          status: "borrador",
        },
        data: {
          status: "enviado",
          submittedAt: now,
          submittedBy: ctx.userId,
        },
      }).catch((err) => console.error("[RONDAS] CN auto-submit failed:", err));
    }

    // Send email in background — don't block the response
    const noRealizadas = roundsData.filter(r => r.status === "no_realizada").length;
    const baseUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";

    sendMonitorTurnoEmail(
      {
        turnoId: id,
        tenantId: ctx.tenantId,
        operatorName: turno.operatorName ?? ctx.userId,
        startedAt: turno.startedAt,
        endedAt: now,
        totalRounds: totalRounds,
        completadas,
        incompletas,
        noRealizadas,
        trustAvg,
        totalAlerts: alertsData.length,
        criticalAlerts,
        resolvedAlerts: resolvedAlerts.length,
        unresolvedAlerts: unresolvedAlerts.length,
        operatorComments: parsed.data.operatorComments,
        aiSummary,
        baseUrl,
      },
      parsed.data.emailRecipients ?? undefined,
    ).catch((err) => console.error("[RONDAS] Email send failed:", err));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[RONDAS] POST monitoreo turno close", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
