/**
 * API Route: /api/ops/protocols/client-report/pdf
 * GET - Generate PDF of the client-facing security report
 *
 * Query: ?installationId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import {
  ClientReportPDF,
  type ClientReportPDFProps,
} from "@/components/pdf/ClientReportPDF";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Only admin/supervisor with ops view can export client reports
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para exportar reporte" },
        { status: 403 },
      );
    }

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
    const examIds: string[] = exams.map((e: { id: string }) => e.id);

    const examAssignments = await prisma.opsExamAssignment.findMany({
      where: { examId: { in: examIds }, tenantId: ctx.tenantId },
    });

    const completedAssignments = examAssignments.filter(
      (a: typeof examAssignments[number]) => a.status === "completed",
    );
    const evaluatedGuardIds = new Set(
      completedAssignments.map((a: typeof examAssignments[number]) => a.guardId),
    );

    // Per-guard scores
    const guardScoreMap = new Map<string, number[]>();
    for (const a of completedAssignments) {
      const scores = guardScoreMap.get(a.guardId) ?? [];
      scores.push(Number(a.score ?? 0));
      guardScoreMap.set(a.guardId, scores);
    }

    const allScores: number[] = completedAssignments.map(
      (a: typeof examAssignments[number]) => Number(a.score ?? 0),
    );
    const avgCompliance =
      allScores.length > 0
        ? Math.round(allScores.reduce((s: number, v: number) => s + v, 0) / allScores.length)
        : 0;

    let approvedGuards = 0;
    for (const [, scores] of guardScoreMap) {
      if (scores[0] >= 80) approvedGuards++;
    }

    const completedWithDate = completedAssignments.filter(
      (a: typeof examAssignments[number]) => a.completedAt,
    );
    const sortedByDate = completedWithDate.sort(
      (a: typeof examAssignments[number], b: typeof examAssignments[number]) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    );
    const lastEvaluation =
      sortedByDate.length > 0
        ? sortedByDate[0]?.completedAt?.toISOString() ?? null
        : null;

    // Section compliance
    const protocolSections = await prisma.opsProtocolSection.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      select: { title: true, icon: true },
      orderBy: { order: "asc" },
    });

    const allExamQuestions = await prisma.opsExamQuestion.findMany({
      where: { examId: { in: examIds } },
      select: { id: true, sectionReference: true, correctAnswer: true },
    });
    type QuestionInfo = typeof allExamQuestions[number];
    const questionMap = new Map<string, QuestionInfo>(
      allExamQuestions.map((q: QuestionInfo) => [q.id, q]),
    );

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
        if (String(answer) === String(q.correctAnswer)) data.correct++;
        sectionAnswerData.set(section, data);
      }
    }

    type SectionInfo = typeof protocolSections[number];
    const sectionCompliance: ClientReportPDFProps["sectionCompliance"] = protocolSections.map(
      (ps: SectionInfo) => {
        const data = sectionAnswerData.get(ps.title);
        return {
          title: ps.title,
          icon: ps.icon,
          percentage: data && data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        };
      },
    );

    // Guard performance
    type GuardAssignment = typeof guardAssignments[number];
    const guardPerformance: ClientReportPDFProps["guardPerformance"] = guardAssignments.map(
      (ga: GuardAssignment) => {
        const scores = guardScoreMap.get(ga.guardiaId) ?? [];
        const latestScore = scores.length > 0 ? scores[0] : null;
        const avgScore =
          scores.length > 0
            ? Math.round(scores.reduce((s: number, v: number) => s + v, 0) / scores.length)
            : null;
        const start = ga.puesto?.shiftStart ?? "";
        const h = parseInt(start.split(":")[0] ?? "0", 10);
        const shiftLabel = h >= 6 && h < 18 ? "Día" : "Noche";
        let status: "approved" | "improving" | "pending" = "pending";
        if (latestScore !== null) {
          status = latestScore >= 80 ? "approved" : "improving";
        }
        return {
          name: `${ga.guardia.persona.firstName} ${ga.guardia.persona.lastName}`.trim(),
          shiftLabel,
          latestScore,
          avgScore,
          status,
        };
      },
    );

    // Month/year string
    const now = new Date();
    const monthYear = now.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    const capitalizedMonthYear = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      ClientReportPDF({
        installationName: installation.name,
        monthYear: capitalizedMonthYear,
        stats: {
          totalGuards,
          evaluatedGuards: evaluatedGuardIds.size,
          avgCompliance,
          approvedGuards,
          lastEvaluation,
        },
        sectionCompliance,
        guardPerformance,
      }),
    );

    const safeInstName = installation.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "").replace(/\s+/g, "_");
    const fileName = `Reporte_Seguridad_${safeInstName}_${now.toISOString().slice(0, 7)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error generating client report PDF:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar PDF del reporte" },
      { status: 500 },
    );
  }
}
