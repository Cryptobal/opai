/**
 * POST /api/cron/exam-recurring
 *
 * Para cada examen activo `scheduleType: "recurring"`:
 *  - Resuelve la frecuencia en días (exam.recurringDays > recurringMonths*30 > tenant default).
 *  - Por cada guardia activo en la instalación, si no tiene asignación pendiente
 *    y la última (completada o enviada) es más vieja que el cutoff, crea una nueva
 *    `ExamAssignment` con tracking completo y notifica.
 *  - Persiste un `ExamRecurringDispatchRun` por tenant con contadores y errores
 *    (Ley 21.719: prueba de entrega).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: diario 03:00 UTC (vercel.json).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnowledgeConfig, resolveRecurringDays } from "@/lib/knowledge/config";
import { createAssignmentAndNotify } from "@/lib/knowledge/dispatch-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RunAccumulator {
  id: string;
  examsProcessed: number;
  assignmentsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  errors: Array<{ examId: string; message: string }>;
}

export async function POST(request: Request) {
  const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const summary = {
    processed: 0,
    created: 0,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: 0,
    skipped: 0,
    errors: [] as Array<{ examId: string; message: string }>,
  };

  const runByTenant = new Map<string, RunAccumulator>();

  try {
    const exams = await prisma.exam.findMany({
      where: {
        status: "active",
        scheduleType: "recurring",
      },
      select: {
        id: true,
        title: true,
        installationId: true,
        recurringDays: true,
        recurringMonths: true,
        installation: { select: { id: true, tenantId: true } },
        _count: { select: { questions: true } },
      },
    });

    for (const exam of exams) {
      summary.processed += 1;

      const tenantId = exam.installation?.tenantId;
      if (!tenantId || exam._count.questions === 0) {
        summary.skipped += 1;
        continue;
      }

      // Lazy-create dispatch run por tenant
      if (!runByTenant.has(tenantId)) {
        const run = await prisma.examRecurringDispatchRun.create({
          data: { tenantId, triggerSource: "cron", startedAt: now },
          select: { id: true },
        });
        runByTenant.set(tenantId, {
          id: run.id,
          examsProcessed: 0,
          assignmentsCreated: 0,
          emailsSent: 0,
          emailsFailed: 0,
          emailsSkipped: 0,
          errors: [],
        });
      }
      const run = runByTenant.get(tenantId)!;
      run.examsProcessed += 1;

      try {
        const cfg = await getKnowledgeConfig(tenantId);
        const recurringDays = resolveRecurringDays(exam, cfg.recurringDefaultDays);
        if (recurringDays <= 0) {
          summary.skipped += 1;
          continue;
        }

        const cutoff = new Date(now.getTime() - recurringDays * 24 * 60 * 60 * 1000);

        const activeAssigns = await prisma.opsAsignacionGuardia.findMany({
          where: { installationId: exam.installationId, isActive: true },
          select: { guardiaId: true },
          distinct: ["guardiaId"],
        });

        for (const a of activeAssigns) {
          const pending = await prisma.examAssignment.findFirst({
            where: {
              examId: exam.id,
              guardId: a.guardiaId,
              status: { in: ["sent", "opened"] },
            },
            select: { id: true },
          });
          if (pending) {
            summary.skipped += 1;
            continue;
          }

          const last = await prisma.examAssignment.findFirst({
            where: { examId: exam.id, guardId: a.guardiaId },
            orderBy: [{ completedAt: "desc" }, { sentAt: "desc" }],
            select: { completedAt: true, sentAt: true, attemptNumber: true },
          });

          const reference = last?.completedAt ?? last?.sentAt ?? null;
          if (reference && reference > cutoff) {
            summary.skipped += 1;
            continue;
          }

          const result = await createAssignmentAndNotify({
            examId: exam.id,
            examTitle: exam.title,
            guardId: a.guardiaId,
            tenantId,
            trigger: "recurring",
            triggeredByUserId: null,
            attemptNumber: (last?.attemptNumber ?? 0) + 1,
            deadlineDays: cfg.deadlineDays,
            emailEnabled: cfg.emailEnabled,
            dispatchRunId: run.id,
          });

          summary.created += 1;
          run.assignmentsCreated += 1;

          if (result.emailStatus === "sent") {
            summary.emailsSent += 1;
            run.emailsSent += 1;
          } else if (result.emailStatus === "failed") {
            summary.emailsFailed += 1;
            run.emailsFailed += 1;
          } else {
            summary.emailsSkipped += 1;
            run.emailsSkipped += 1;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary.errors.push({ examId: exam.id, message });
        run.errors.push({ examId: exam.id, message });
        console.error("[knowledge-recurring] exam failed", { examId: exam.id, err });
      }
    }
  } catch (err) {
    console.error("[knowledge-recurring] fatal", err);
  }

  // Cerrar dispatch runs con contadores finales
  const finishedAt = new Date();
  await Promise.all(
    Array.from(runByTenant.values()).map((run) =>
      prisma.examRecurringDispatchRun.update({
        where: { id: run.id },
        data: {
          finishedAt,
          examsProcessed: run.examsProcessed,
          assignmentsCreated: run.assignmentsCreated,
          emailsSent: run.emailsSent,
          emailsFailed: run.emailsFailed,
          emailsSkipped: run.emailsSkipped,
          errors: run.errors.length > 0 ? run.errors : undefined,
        },
      }),
    ),
  );

  return NextResponse.json({
    success: true,
    ...summary,
    tenantRuns: runByTenant.size,
    timestamp: now.toISOString(),
  });
}
