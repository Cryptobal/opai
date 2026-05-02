/**
 * When a guard becomes active on an installation we want to automatically
 * deliver any exam configured with `scheduleType: "on_assignment"`.
 *
 * Best-effort: never throws inside the parent transaction; catches and
 * logs any error so the assignment flow never breaks.
 */

import { prisma } from "@/lib/prisma";
import { getKnowledgeConfig } from "@/lib/knowledge/config";
import { createAssignmentAndNotify } from "@/lib/knowledge/dispatch-helpers";

export interface AutoAssignParams {
  guardId: string;
  installationId: string;
  tenantId: string;
}

export interface AutoAssignResult {
  examsCreated: number;
  examsSkipped: number;
}

export async function assignOnAssignmentExams(
  params: AutoAssignParams,
): Promise<AutoAssignResult> {
  const result: AutoAssignResult = { examsCreated: 0, examsSkipped: 0 };

  try {
    const exams = await prisma.exam.findMany({
      where: {
        installationId: params.installationId,
        scheduleType: "on_assignment",
        status: "active",
      },
      select: { id: true, title: true, _count: { select: { questions: true } } },
    });

    if (exams.length === 0) return result;

    const cfg = await getKnowledgeConfig(params.tenantId);

    for (const exam of exams) {
      if (exam._count.questions === 0) {
        result.examsSkipped += 1;
        continue;
      }

      const existing = await prisma.examAssignment.findFirst({
        where: {
          examId: exam.id,
          guardId: params.guardId,
          status: { in: ["sent", "opened"] },
        },
        select: { id: true },
      });

      if (existing) {
        result.examsSkipped += 1;
        continue;
      }

      const lastAttempt = await prisma.examAssignment.aggregate({
        where: { examId: exam.id, guardId: params.guardId },
        _max: { attemptNumber: true },
      });

      try {
        await createAssignmentAndNotify({
          examId: exam.id,
          examTitle: exam.title,
          guardId: params.guardId,
          tenantId: params.tenantId,
          trigger: "on_assignment",
          triggeredByUserId: null,
          attemptNumber: (lastAttempt._max.attemptNumber ?? 0) + 1,
          deadlineDays: cfg.deadlineDays,
          emailEnabled: cfg.emailEnabled,
        });
        result.examsCreated += 1;
      } catch (err) {
        console.error("[knowledge-recurring] auto-assign create failed", {
          examId: exam.id,
          guardId: params.guardId,
          err,
        });
        result.examsSkipped += 1;
      }
    }
  } catch (err) {
    console.error("[knowledge-recurring] auto-assign-exams failed", {
      guardId: params.guardId,
      installationId: params.installationId,
      err,
    });
  }

  return result;
}
