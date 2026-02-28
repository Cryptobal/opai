/**
 * API Route: /api/ops/exams/guards
 * GET - List guards assigned to an installation with their exam scores
 *
 * Query: ?installationId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para ver guardias" }, { status: 403 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    // Get all active guard assignments for this installation
    const assignments = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        isActive: true,
      },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        puesto: {
          select: { name: true, shiftStart: true, shiftEnd: true },
        },
      },
    });

    // Get exam IDs for this installation
    const exams = await prisma.opsExam.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      select: { id: true },
    });
    const examIds = exams.map((e) => e.id);
    const totalExams = examIds.length;

    // Get all exam assignments for guards at this installation
    const guardIds = assignments.map((a) => a.guardiaId);
    const examAssignments = await prisma.opsExamAssignment.findMany({
      where: {
        examId: { in: examIds },
        guardId: { in: guardIds },
        tenantId: ctx.tenantId,
      },
      select: {
        guardId: true,
        status: true,
        score: true,
        completedAt: true,
      },
      orderBy: { completedAt: "desc" },
    });

    // Build per-guard data
    const guardMap = new Map<string, {
      scores: number[];
      completed: number;
      pending: number;
      lastCompletedAt: Date | null;
    }>();

    for (const ea of examAssignments) {
      const data = guardMap.get(ea.guardId) ?? {
        scores: [],
        completed: 0,
        pending: 0,
        lastCompletedAt: null,
      };

      if (ea.status === "completed") {
        data.scores.push(Number(ea.score ?? 0));
        data.completed++;
        if (!data.lastCompletedAt && ea.completedAt) {
          data.lastCompletedAt = ea.completedAt;
        }
      } else if (ea.status === "sent" || ea.status === "opened") {
        data.pending++;
      }

      guardMap.set(ea.guardId, data);
    }

    // Build response
    const guards = assignments.map((a) => {
      const data = guardMap.get(a.guardiaId);
      const scores = data?.scores ?? [];
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : null;

      // Calculate trend from last 3 scores
      let trend: "up" | "stable" | "down" = "stable";
      if (scores.length >= 2) {
        const recent = scores.slice(0, 3);
        const older = scores.slice(Math.max(0, scores.length - 3));
        const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
        const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
        if (recentAvg > olderAvg + 5) trend = "up";
        else if (recentAvg < olderAvg - 5) trend = "down";
      }

      // Derive shift label from shiftStart
      const start = a.puesto?.shiftStart ?? "";
      const startHour = parseInt(start.split(":")[0] ?? "0", 10);
      const shiftLabel = startHour >= 6 && startHour < 18 ? "Día" : "Noche";

      return {
        guardId: a.guardiaId,
        firstName: a.guardia.persona.firstName,
        lastName: a.guardia.persona.lastName,
        shiftLabel,
        puestoName: a.puesto?.name ?? null,
        avgScore,
        completed: data?.completed ?? 0,
        totalExams,
        pending: data?.pending ?? 0,
        lastCompletedAt: data?.lastCompletedAt?.toISOString() ?? null,
        trend,
      };
    });

    return NextResponse.json({ success: true, data: guards });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching guards:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener guardias" },
      { status: 500 },
    );
  }
}
