/**
 * POST /api/cron/exam-recurring
 *
 * For every active exam with `scheduleType: "recurring"` and a non-null
 * `recurringMonths`, ensures that each currently-active guard on the
 * installation has a fresh `ExamAssignment` if the previous one is older
 * than `recurringMonths` months (or the guard never had one).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (same pattern as
 * `/api/cron/biometric-cleanup`).
 *
 * Schedule: daily 03:00 UTC (see vercel.json).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyGuardOfExam } from "@/lib/protocols/notify-guard-exam";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const exams = await prisma.exam.findMany({
      where: {
        status: "active",
        scheduleType: "recurring",
        recurringMonths: { not: null },
      },
      select: {
        id: true,
        title: true,
        installationId: true,
        recurringMonths: true,
        installation: { select: { id: true, tenantId: true } },
        _count: { select: { questions: true } },
      },
    });

    for (const exam of exams) {
      processed += 1;
      try {
        if (!exam.recurringMonths || exam._count.questions === 0) {
          skipped += 1;
          continue;
        }
        const tenantId = exam.installation?.tenantId;
        if (!tenantId) {
          skipped += 1;
          continue;
        }

        const cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() - exam.recurringMonths);

        const activeAssigns = await prisma.opsAsignacionGuardia.findMany({
          where: { installationId: exam.installationId, isActive: true },
          select: { guardiaId: true },
          distinct: ["guardiaId"],
        });

        for (const a of activeAssigns) {
          // Don't double-create if there is already a non-completed
          // assignment we sent for this exam.
          const pending = await prisma.examAssignment.findFirst({
            where: {
              examId: exam.id,
              guardId: a.guardiaId,
              status: { in: ["sent", "opened"] },
            },
            select: { id: true },
          });
          if (pending) {
            skipped += 1;
            continue;
          }

          const last = await prisma.examAssignment.findFirst({
            where: { examId: exam.id, guardId: a.guardiaId },
            orderBy: [{ completedAt: "desc" }, { sentAt: "desc" }],
            select: {
              completedAt: true,
              sentAt: true,
              attemptNumber: true,
            },
          });

          const reference = last?.completedAt ?? last?.sentAt ?? null;
          if (reference && reference > cutoff) {
            skipped += 1;
            continue;
          }

          const assignment = await prisma.examAssignment.create({
            data: {
              examId: exam.id,
              guardId: a.guardiaId,
              status: "sent",
              attemptNumber: (last?.attemptNumber ?? 0) + 1,
            },
          });
          created += 1;

          void notifyGuardOfExam({
            examId: exam.id,
            examTitle: exam.title,
            guardId: a.guardiaId,
            tenantId,
            assignmentId: assignment.id,
            trigger: "recurring",
          });
        }
      } catch (err) {
        errors += 1;
        console.error("[cron/exam-recurring] exam failed", { examId: exam.id, err });
      }
    }
  } catch (err) {
    console.error("[cron/exam-recurring] fatal", err);
    return NextResponse.json(
      { success: false, processed, created, skipped, errors: errors + 1 },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    processed,
    created,
    skipped,
    errors,
    timestamp: now.toISOString(),
  });
}
