import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canDelete, hasCapability } from "@/lib/permissions";
import { monitoreoTurnoCloseSchema } from "@/lib/validations/rondas";
import { sendMonitorTurnoEmail } from "@/lib/rondas/monitor-email";
import { buildTurnoReportData } from "@/lib/rondas/monitor-turno-report-data";

// PDF generation with Chromium needs more memory and time
export const maxDuration = 120;

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

    // Only the operator OR admin/owner/users with monitoreo_cerrar_turno capability can close
    const isOwnTurno = turno.operatorId === ctx.userId;
    const hasCloseCap = hasCapability(perms, "monitoreo_cerrar_turno");
    const canEditRondas = canEdit(perms, "ops", "rondas");
    if (!isOwnTurno && !hasCloseCap && !canEditRondas) {
      return NextResponse.json(
        { success: false, error: "Solo el operador del turno o un admin puede cerrarlo" },
        { status: 403 },
      );
    }

    const now = new Date();

    const [roundsData, alertsData, incidentesData] = await Promise.all([
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
          resuelta: true, resolutionNotes: true, resueltaAt: true, createdAt: true,
          installation: { select: { name: true } },
        },
      }),
      prisma.opsRondaIncidente.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: turno.startedAt, lte: now },
        },
        select: {
          id: true,
          tipo: true,
          descripcion: true,
          createdAt: true,
          installation: { select: { name: true } },
          guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: "asc" },
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

    if (parsed.data.operatorComments) {
      summaryLines.push(``, `Comentarios del operador: ${parsed.data.operatorComments}`);
    }
    const aiSummary = summaryLines.join("\n");

    const incidentesParaEmail = incidentesData.map((inc) => ({
      guardia: inc.guardia?.persona
        ? `${inc.guardia.persona.firstName ?? ""} ${inc.guardia.persona.lastName ?? ""}`.trim()
        : "—",
      instalacion: inc.installation?.name ?? "—",
      tipo: inc.tipo,
      descripcion: inc.descripcion,
      fecha: inc.createdAt.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    }));

    // Archive all unresolved alerts associated with this turno
    await prisma.opsAlertaRonda.updateMany({
      where: {
        turnoId: turno.id,
        resuelta: false,
        archivedAt: null,
      },
      data: {
        archivedAt: now,
      },
    });

    // Also archive orphan alerts (no turnoId) created during this turno
    await prisma.opsAlertaRonda.updateMany({
      where: {
        tenantId: ctx.tenantId,
        turnoId: null,
        resuelta: false,
        archivedAt: null,
        createdAt: {
          gte: turno.startedAt,
          lte: now,
        },
      },
      data: {
        archivedAt: now,
        turnoId: turno.id,
      },
    });

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

    // Always send email — ops email is always included by sendMonitorTurnoEmail
    const noRealizadas = roundsData.filter(r => r.status === "no_realizada").length;
    const baseUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";

    // Build enriched report data (7-day history, guard ranking, semáforo, deltas, reliability, PDF)
    let reportData: Awaited<ReturnType<typeof buildTurnoReportData>> | null = null;
    try {
      reportData = await buildTurnoReportData({
        tenantId: ctx.tenantId,
        turnoStartedAt: turno.startedAt,
        turnoEndedAt: now,
        roundsData: roundsData as any,
        alertsData: alertsData as any,
        operatorName: turno.operatorName ?? ctx.userId,
        operatorComments: parsed.data.operatorComments,
      });
      console.log("[RONDAS] Report data built successfully, pdfData present:", !!reportData.pdfData);
    } catch (err) {
      console.error("[RONDAS] buildTurnoReportData failed:", err instanceof Error ? err.message : err);
    }

    // MUST await: Vercel serverless kills fire-and-forget on return
    try {
      const emailResult = await sendMonitorTurnoEmail(
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
          // v2 enrichments (graceful if reportData failed)
          panicos: reportData?.panicos,
          panicoStats30d: reportData?.panicoStats30d,
          deltaCompletadas: reportData?.deltaCompletadas,
          deltaNoRealizadas: reportData?.deltaNoRealizadas,
          deltaTrustAvg: reportData?.deltaTrustAvg,
          deltaCriticalAlerts: reportData?.deltaCriticalAlerts,
          semaforo: reportData?.semaforo,
          reliability: reportData?.reliability,
          installationSummaries: reportData?.installationSummaries,
          incidentesDelGuardia: incidentesParaEmail,
          pdfData: reportData?.pdfData,
        },
        parsed.data.emailRecipients ?? undefined,
      );
      if (!emailResult.ok) {
        console.error("[RONDAS] Email send failed:", emailResult.error);
      }
    } catch (err) {
      console.error("[RONDAS] Email send error:", err);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[RONDAS] POST monitoreo turno close", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

/**
 * DELETE — Admin/owner only: delete turno without saving or sending email.
 * Used for testing purposes.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Only admin/owner can delete
    if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo admin/owner puede eliminar turnos" },
        { status: 403 },
      );
    }

    const turno = await prisma.opsMonitoreoTurno.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!turno) {
      return NextResponse.json({ success: false, error: "Turno no encontrado" }, { status: 404 });
    }

    // Archive alerts linked to this turno
    await prisma.opsAlertaRonda.updateMany({
      where: { turnoId: id },
      data: { archivedAt: new Date() },
    });

    // Delete the turno
    await prisma.opsMonitoreoTurno.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] DELETE monitoreo turno", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
