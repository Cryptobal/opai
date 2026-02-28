/**
 * API Route: /api/ops/protocols/client-report
 * GET - Client-facing security report data for an installation
 *
 * Query: ?installationId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    // Installation info
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    // Guards assigned
    const guardAssignments = await prisma.opsAsignacionGuardia.findMany({
      where: { tenantId: ctx.tenantId, installationId, isActive: true },
      include: {
        guardia: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
        puesto: { select: { shiftStart: true } },
      },
    });
    const totalGuards = guardAssignments.length;

    // Exams & assignments
    const exams = await prisma.opsExam.findMany({
      where: { tenantId: ctx.tenantId, installationId, type: "protocol" },
      select: { id: true },
    });
    const examIds = exams.map((e) => e.id);

    const examAssignments = await prisma.opsExamAssignment.findMany({
      where: {
        examId: { in: examIds },
        tenantId: ctx.tenantId,
      },
      include: {
        exam: {
          include: {
            questions: {
              select: { id: true, sectionReference: true },
            },
          },
        },
      },
    });

    // Guards who have at least one completed exam
    const completedAssignments = examAssignments.filter((a) => a.status === "completed");
    const evaluatedGuardIds = new Set(completedAssignments.map((a) => a.guardId));

    // Per-guard scores
    const guardScoreMap = new Map<string, number[]>();
    for (const a of completedAssignments) {
      const scores = guardScoreMap.get(a.guardId) ?? [];
      scores.push(Number(a.score ?? 0));
      guardScoreMap.set(a.guardId, scores);
    }

    // Average protocol compliance
    const allScores = completedAssignments.map((a) => Number(a.score ?? 0));
    const avgCompliance = allScores.length > 0
      ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
      : 0;

    // Guards with >= 80% on latest exam
    let approvedGuards = 0;
    for (const [, scores] of guardScoreMap) {
      if (scores[0] >= 80) approvedGuards++;
    }

    // Last evaluation date
    const lastEvaluation = completedAssignments.length > 0
      ? completedAssignments
          .filter((a) => a.completedAt)
          .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))[0]
          ?.completedAt?.toISOString() ?? null
      : null;

    // Section compliance from answers
    // Parse the JSON answers to compute per-section compliance
    const sectionScores = new Map<string, { correct: number; total: number }>();

    for (const a of completedAssignments) {
      const answers = a.answers as Record<string, string> | null;
      if (!answers) continue;

      for (const q of a.exam.questions) {
        const section = q.sectionReference ?? "General";
        const data = sectionScores.get(section) ?? { correct: 0, total: 0 };
        data.total++;
        // Check if answer was correct - answers are stored as { questionId: selectedOptionIndex }
        if (answers[q.id] !== undefined) {
          // We don't have correctAnswer in this query - we'll approximate from scores
          // A simpler approach: distribute the overall score proportionally
        }
        sectionScores.set(section, data);
      }
    }

    // Simpler approach: get sections from protocol and compute approximate per-section scores
    const protocolSections = await prisma.opsProtocolSection.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      select: { title: true, icon: true },
      orderBy: { order: "asc" },
    });

    // Compute section compliance from exam questions that reference each section
    const sectionCompliance: Array<{ title: string; icon: string | null; percentage: number }> = [];

    // Get all questions with their section references and correct answers
    const allExamQuestions = await prisma.opsExamQuestion.findMany({
      where: { examId: { in: examIds } },
      select: { id: true, sectionReference: true, correctAnswer: true },
    });
    const questionMap = new Map(allExamQuestions.map((q) => [q.id, q]));

    // Build section answer data
    const sectionAnswerData = new Map<string, { correct: number; total: number }>();
    for (const a of completedAssignments) {
      const answers = a.answers as Record<string, string> | null;
      if (!answers) continue;

      for (const [questionId, answer] of Object.entries(answers)) {
        const q = questionMap.get(questionId);
        if (!q) continue;
        const section = q.sectionReference ?? "General";
        const data = sectionAnswerData.get(section) ?? { correct: 0, total: 0 };
        data.total++;
        if (String(answer) === String(q.correctAnswer)) {
          data.correct++;
        }
        sectionAnswerData.set(section, data);
      }
    }

    for (const ps of protocolSections) {
      const data = sectionAnswerData.get(ps.title);
      sectionCompliance.push({
        title: ps.title,
        icon: ps.icon,
        percentage: data && data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      });
    }

    // Guard performance table
    const guardPerformance = guardAssignments.map((ga) => {
      const scores = guardScoreMap.get(ga.guardiaId) ?? [];
      const latestScore = scores.length > 0 ? scores[0] : null;
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
        : null;

      let trend: "up" | "stable" | "down" = "stable";
      if (scores.length >= 2) {
        if (scores[0] > scores[1] + 5) trend = "up";
        else if (scores[0] < scores[1] - 5) trend = "down";
      }

      const start = ga.puesto?.shiftStart ?? "";
      const h = parseInt(start.split(":")[0] ?? "0", 10);
      const shiftLabel = h >= 6 && h < 18 ? "Día" : "Noche";

      let status: "approved" | "improving" | "pending" = "pending";
      if (latestScore !== null) {
        status = latestScore >= 80 ? "approved" : "improving";
      }

      return {
        guardId: ga.guardiaId,
        name: `${ga.guardia.persona.firstName} ${ga.guardia.persona.lastName}`.trim(),
        shiftLabel,
        latestScore,
        avgScore,
        trend,
        status,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        installationName: installation.name,
        reportDate: new Date().toISOString(),
        stats: {
          totalGuards,
          evaluatedGuards: evaluatedGuardIds.size,
          avgCompliance,
          approvedGuards,
          lastEvaluation,
        },
        sectionCompliance,
        guardPerformance,
      },
    });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error generating client report:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar reporte" },
      { status: 500 },
    );
  }
}
