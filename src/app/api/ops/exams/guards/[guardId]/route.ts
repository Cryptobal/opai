/**
 * API Route: /api/ops/exams/guards/[guardId]
 * GET - Detailed exam history for a specific guard at an installation
 *
 * Query: ?installationId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { guardId: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para ver guardias" }, { status: 403 });
    }

    const { guardId } = await params;
    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    // Get guard info
    const guard = await prisma.opsGuardia.findFirst({
      where: { id: guardId, tenantId: ctx.tenantId },
      include: {
        persona: { select: { firstName: true, lastName: true } },
      },
    });

    if (!guard) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    // Get guard's shift info at this installation
    const guardAssignment = await prisma.opsAsignacionGuardia.findFirst({
      where: {
        guardiaId: guardId,
        installationId,
        tenantId: ctx.tenantId,
        isActive: true,
      },
      include: {
        puesto: { select: { shiftStart: true } },
      },
    });

    // Get exam IDs for this installation
    const exams = await prisma.opsExam.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      select: { id: true, title: true, type: true },
    });
    const examMap = new Map(exams.map((e) => [e.id, e]));

    // Get all exam assignments for this guard
    const assignments = await prisma.opsExamAssignment.findMany({
      where: {
        guardId: guardId,
        examId: { in: exams.map((e) => e.id) },
        tenantId: ctx.tenantId,
      },
      orderBy: { sentAt: "desc" },
    });

    // Calculate stats
    const completed = assignments.filter((a) => a.status === "completed");
    const scores = completed.map((a) => Number(a.score ?? 0));
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : null;
    const bestScore = scores.length > 0 ? Math.max(...scores) : null;

    // Trend
    let trend: "up" | "stable" | "down" = "stable";
    if (scores.length >= 2) {
      const recent = scores.slice(0, Math.min(3, Math.floor(scores.length / 2)));
      const older = scores.slice(-Math.min(3, Math.ceil(scores.length / 2)));
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
      if (recentAvg > olderAvg + 5) trend = "up";
      else if (recentAvg < olderAvg - 5) trend = "down";
    }

    // Build history
    const history = assignments.map((a) => {
      const exam = examMap.get(a.examId);
      return {
        assignmentId: a.id,
        examId: a.examId,
        examTitle: exam?.title ?? "—",
        examType: exam?.type ?? "protocol",
        status: a.status,
        sentAt: a.sentAt.toISOString(),
        openedAt: a.openedAt?.toISOString() ?? null,
        completedAt: a.completedAt?.toISOString() ?? null,
        score: a.score ? Number(a.score) : null,
        timeTakenSeconds: a.timeTakenSeconds,
        attemptNumber: a.attemptNumber,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        guard: {
          id: guardId,
          firstName: guard.persona.firstName,
          lastName: guard.persona.lastName,
          shiftLabel: (() => {
            const start = guardAssignment?.puesto?.shiftStart ?? "";
            const h = parseInt(start.split(":")[0] ?? "0", 10);
            return h >= 6 && h < 18 ? "Día" : "Noche";
          })(),
        },
        stats: {
          avgScore,
          bestScore,
          completedCount: completed.length,
          totalAssigned: assignments.length,
          trend,
        },
        history,
      },
    });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching guard history:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener historial del guardia" },
      { status: 500 },
    );
  }
}
