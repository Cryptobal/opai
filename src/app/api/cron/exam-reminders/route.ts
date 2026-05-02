/**
 * POST /api/cron/exam-reminders
 *
 * Hourly cron with two responsibilities:
 *
 *  A) Expirar — marca como `expired` cualquier `ExamAssignment` con
 *     status in (sent, opened) cuyo `dueAt` ya pasó.
 *
 *  B) Recordatorios — envía un mail recordatorio a las asignaciones que
 *     siguen en `sent`, con notificación inicial enviada (`notificationStatus = 'sent'`),
 *     todavía sin `reminderSentAt`, y cuyo `sentAt + reminderDays < now`.
 *     `reminderDays` se lee de `KnowledgeConfig` por tenant; 0 = desactivado.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: cada hora (vercel.json `0 * * * *`).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnowledgeConfig } from "@/lib/knowledge/config";
import { sendExamReminder } from "@/lib/protocols/notify-guard-exam-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REMINDER_BATCH_CAP = 500;

export async function POST(request: Request) {
  const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let expired = 0;
  let remindersSent = 0;
  let remindersFailed = 0;
  let remindersSkipped = 0;

  // ── A) Expirar asignaciones vencidas ──
  try {
    const result = await prisma.examAssignment.updateMany({
      where: {
        status: { in: ["sent", "opened"] },
        dueAt: { not: null, lt: now },
      },
      data: { status: "expired" },
    });
    expired = result.count;
  } catch (err) {
    console.error("[exam-reminders] expire pass failed", err);
  }

  // ── B) Recordatorios ──
  try {
    const candidates = await prisma.examAssignment.findMany({
      where: {
        status: "sent",
        reminderSentAt: null,
        notificationStatus: "sent",
      },
      select: {
        id: true,
        sentAt: true,
        examId: true,
        guardId: true,
        exam: {
          select: {
            title: true,
            installation: { select: { tenantId: true } },
          },
        },
      },
      take: REMINDER_BATCH_CAP,
    });

    // Cache de reminderDays por tenant para no repetir lecturas.
    const tenantReminderDays = new Map<string, number>();

    for (const a of candidates) {
      const tenantId = a.exam.installation?.tenantId;
      if (!tenantId) {
        remindersSkipped += 1;
        continue;
      }

      let reminderDays = tenantReminderDays.get(tenantId);
      if (reminderDays === undefined) {
        const cfg = await getKnowledgeConfig(tenantId);
        reminderDays = cfg.reminderDays;
        tenantReminderDays.set(tenantId, reminderDays);
      }

      if (reminderDays <= 0) {
        remindersSkipped += 1;
        continue;
      }

      const triggerAfter = new Date(a.sentAt.getTime() + reminderDays * 24 * 60 * 60 * 1000);
      if (triggerAfter > now) {
        remindersSkipped += 1;
        continue;
      }

      try {
        const result = await sendExamReminder({
          examId: a.examId,
          examTitle: a.exam.title,
          guardId: a.guardId,
          tenantId,
          assignmentId: a.id,
        });

        // Solo marcamos `reminderSentAt` cuando el mail efectivamente salió.
        if (result.status === "sent") {
          await prisma.examAssignment.update({
            where: { id: a.id },
            data: { reminderSentAt: new Date() },
          });
          remindersSent += 1;
        } else if (result.status === "failed") {
          remindersFailed += 1;
        } else {
          remindersSkipped += 1;
        }
      } catch (err) {
        remindersFailed += 1;
        console.error("[exam-reminders] send loop failed", {
          assignmentId: a.id,
          err,
        });
      }
    }
  } catch (err) {
    console.error("[exam-reminders] reminders pass failed", err);
  }

  return NextResponse.json({
    success: true,
    expired,
    remindersSent,
    remindersFailed,
    remindersSkipped,
    timestamp: now.toISOString(),
  });
}
