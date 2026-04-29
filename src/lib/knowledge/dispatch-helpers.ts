/**
 * Helpers compartidos para crear ExamAssignment con tracking completo
 * y notificar al guardia con persistencia del resultado.
 *
 * Único punto donde se crean ExamAssignment con `trigger`/`dueAt`/
 * `notificationStatus` poblados (manual, on_assignment, recurring).
 */

import { prisma } from "@/lib/prisma";
import { notifyGuardOfExam, type NotifyTrigger } from "@/lib/protocols/notify-guard-exam";

export type DispatchEmailStatus =
  | "sent"
  | "failed"
  | "skipped_no_email"
  | "skipped_no_resend"
  | "skipped_disabled";

export interface CreateAssignmentParams {
  examId: string;
  examTitle: string;
  guardId: string;
  tenantId: string;
  trigger: NotifyTrigger;
  triggeredByUserId?: string | null;
  attemptNumber: number;
  deadlineDays: number;
  emailEnabled: boolean;
  dispatchRunId?: string | null;
}

export interface CreateAssignmentResult {
  assignmentId: string;
  emailStatus: DispatchEmailStatus;
  emailError?: string;
}

/**
 * Crea un ExamAssignment con todos los campos de tracking + intenta notificar.
 * Persiste el resultado de la notificación en el mismo registro.
 *
 * Best-effort frente al envío: nunca rompe; cualquier error queda en
 * `notificationStatus = 'failed'` con mensaje en `notificationError`.
 */
export async function createAssignmentAndNotify(
  params: CreateAssignmentParams,
): Promise<CreateAssignmentResult> {
  const dueAt = new Date(Date.now() + params.deadlineDays * 24 * 60 * 60 * 1000);

  const assignment = await prisma.examAssignment.create({
    data: {
      examId: params.examId,
      guardId: params.guardId,
      status: "sent",
      attemptNumber: params.attemptNumber,
      trigger: params.trigger,
      triggeredByUserId: params.triggeredByUserId ?? null,
      dueAt,
      notificationStatus: "pending",
      dispatchRunId: params.dispatchRunId ?? null,
    },
    select: { id: true },
  });

  if (!params.emailEnabled) {
    await prisma.examAssignment.update({
      where: { id: assignment.id },
      data: { notificationStatus: "skipped_disabled" },
    });
    return { assignmentId: assignment.id, emailStatus: "skipped_disabled" };
  }

  const result = await notifyGuardOfExam({
    examId: params.examId,
    examTitle: params.examTitle,
    guardId: params.guardId,
    tenantId: params.tenantId,
    assignmentId: assignment.id,
    trigger: params.trigger,
  });

  await prisma.examAssignment.update({
    where: { id: assignment.id },
    data: {
      notificationStatus: result.status,
      notificationSentAt: result.status === "sent" ? new Date() : null,
      notificationError: result.error ?? null,
    },
  });

  return {
    assignmentId: assignment.id,
    emailStatus: result.status,
    emailError: result.error,
  };
}
