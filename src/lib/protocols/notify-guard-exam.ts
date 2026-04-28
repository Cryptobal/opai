/**
 * Sends a "you have a new exam pending" notification to a guard.
 *
 * Currently uses email (Resend) only — falls back silently if the guard
 * has no email or `RESEND_API_KEY` is missing. The portal guardia will
 * also surface the exam through `GET /api/portal/guardia/exams` so a
 * missed email does not block the flow.
 *
 * Used from:
 *  - `POST /api/installations/[id]/exams/[examId]/send`
 *  - the `on_assignment` hook (`assignOnAssignmentExams`)
 *  - the `recurring` cron (`/api/cron/exam-recurring`)
 */

import { prisma } from "@/lib/prisma";

export type NotifyTrigger = "manual" | "on_assignment" | "recurring";

export interface NotifyParams {
  examId: string;
  examTitle: string;
  guardId: string;
  tenantId: string;
  assignmentId?: string;
  trigger?: NotifyTrigger;
}

export async function notifyGuardOfExam(params: NotifyParams): Promise<void> {
  try {
    const guard = await prisma.opsGuardia.findUnique({
      where: { id: params.guardId },
      select: {
        id: true,
        personalEmail: true,
        googleEmail: true,
        persona: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const email =
      guard?.personalEmail ??
      guard?.persona?.email ??
      guard?.googleEmail ??
      null;

    if (!email) {
      console.info("[notify-guard-exam] guard has no email", {
        guardId: params.guardId,
        trigger: params.trigger,
      });
      return;
    }

    if (!process.env.RESEND_API_KEY || /test|dummy/i.test(process.env.RESEND_API_KEY ?? "")) {
      console.info("[notify-guard-exam] email skipped (no RESEND_API_KEY)", {
        guardId: params.guardId,
        examId: params.examId,
        email,
      });
      return;
    }

    const { resend, getTenantEmailConfig } = await import("@/lib/resend");
    const cfg = await getTenantEmailConfig(params.tenantId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.opai.cl";
    const link = `${baseUrl}/portal/guardia`;

    const greeting = guard?.persona?.firstName ?? "Hola";
    const subject = `📋 Tienes un nuevo examen pendiente: ${params.examTitle}`;
    const html = `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="font-size: 18px; color: #0F172A; margin: 0 0 12px;">Hola ${greeting},</h2>
        <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 16px;">
          Tienes un nuevo examen pendiente en tu portal de guardia:
        </p>
        <p style="font-size: 16px; font-weight: 600; color: #0F172A; margin: 0 0 16px;">
          ${escapeHtml(params.examTitle)}
        </p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #0066FF; color: white; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Abrir mi portal
          </a>
        </p>
        <p style="font-size: 12px; color: #94A3B8; margin: 24px 0 0;">
          Este examen es parte del protocolo de seguridad de tu instalación. Tu evaluación nos ayuda a mantener la calidad del servicio.
        </p>
      </div>
    `;

    await resend.emails.send({
      from: cfg.from,
      replyTo: cfg.replyTo || undefined,
      to: [email],
      subject,
      html,
    });
  } catch (err) {
    console.error("[notify-guard-exam] failed", {
      guardId: params.guardId,
      examId: params.examId,
      err,
    });
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
