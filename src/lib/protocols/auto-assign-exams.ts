/**
 * When a guard becomes active on an installation we want to automatically
 * deliver any exam configured with `scheduleType: "on_assignment"`.
 *
 * Best-effort: never throws inside the parent transaction; catches and
 * logs any error so the assignment flow never breaks.
 */

import { prisma } from "@/lib/prisma";
import { notifyGuardOfExam } from "@/lib/protocols/notify-guard-exam";

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

      const assignment = await prisma.examAssignment.create({
        data: {
          examId: exam.id,
          guardId: params.guardId,
          status: "sent",
        },
      });
      result.examsCreated += 1;

      // Fire-and-forget notification.
      void notifyGuardOfExam({
        examId: exam.id,
        examTitle: exam.title,
        guardId: params.guardId,
        tenantId: params.tenantId,
        assignmentId: assignment.id,
        trigger: "on_assignment",
      }).catch((err) => {
        console.error("[auto-assign-exams] notify failed", err);
      });
    }
  } catch (err) {
    console.error("[auto-assign-exams] failed", {
      guardId: params.guardId,
      installationId: params.installationId,
      err,
    });
  }

  return result;
}
