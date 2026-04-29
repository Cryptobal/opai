/**
 * Sends a reminder email to a guard who has an open ExamAssignment
 * (status: sent, notification was delivered, but the guard hasn't completed
 * it yet after the configured `reminderDays`).
 *
 * Used from `/api/cron/exam-reminders`.
 *
 * Returns `NotifyResult` (same shape as `notifyGuardOfExam`) so the cron
 * can persist `reminderSentAt` only when the email actually went out.
 */

import { prisma } from "@/lib/prisma";
import type { NotifyResult } from "./notify-guard-exam";

export interface ReminderParams {
  examId: string;
  examTitle: string;
  guardId: string;
  tenantId: string;
  assignmentId: string;
}

export async function sendExamReminder(params: ReminderParams): Promise<NotifyResult> {
  try {
    const guard = await prisma.opsGuardia.findUnique({
      where: { id: params.guardId },
      select: {
        personalEmail: true,
        googleEmail: true,
        persona: { select: { firstName: true, email: true } },
      },
    });

    const email =
      guard?.personalEmail ?? guard?.persona?.email ?? guard?.googleEmail ?? null;
    if (!email) return { status: "skipped_no_email" };

    if (!process.env.RESEND_API_KEY || /test|dummy/i.test(process.env.RESEND_API_KEY ?? "")) {
      return { status: "skipped_no_resend" };
    }

    const { resend, getTenantEmailConfig } = await import("@/lib/resend");
    const cfg = await getTenantEmailConfig(params.tenantId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.opai.cl";
    const link = `${baseUrl}/portal/guardia`;

    await resend.emails.send({
      from: cfg.from,
      replyTo: cfg.replyTo || undefined,
      to: [email],
      subject: `⏰ Recordatorio: examen pendiente — ${params.examTitle}`,
      html: `
        <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="font-size: 18px; color: #0F172A; margin: 0 0 12px;">Hola ${escapeHtml(guard?.persona?.firstName ?? "")},</h2>
          <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 16px;">
            Aún tienes un examen pendiente por responder en tu portal:
          </p>
          <p style="font-size: 16px; font-weight: 600; color: #0F172A; margin: 0 0 16px;">
            ${escapeHtml(params.examTitle)}
          </p>
          <p style="margin: 24px 0;">
            <a href="${link}" style="background: #0066FF; color: white; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Responder ahora
            </a>
          </p>
          <p style="font-size: 12px; color: #94A3B8; margin: 24px 0 0;">
            Si ya lo respondiste, ignora este mensaje.
          </p>
        </div>
      `,
    });

    return { status: "sent" };
  } catch (err) {
    console.error("[exam-reminders] reminder send failed", {
      assignmentId: params.assignmentId,
      err,
    });
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
