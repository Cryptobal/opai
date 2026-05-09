import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmailWithRetry } from "@/lib/email-retry";
import { renderAccessControlReport } from "@/lib/access-control/report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const configs = await prisma.accessControlConfig.findMany({
    where: { autoReportSchedule: { not: null } },
    select: {
      tenantId: true,
      installationId: true,
      autoReportSchedule: true,
      autoReportLastSentAt: true,
      installation: { select: { name: true } },
    },
  });

  const sent: string[] = [];
  const errors: Array<{ installationId: string; error: string }> = [];

  for (const cfg of configs) {
    if (
      !shouldSendNow(
        cfg.autoReportSchedule!,
        cfg.autoReportLastSentAt,
        now
      )
    )
      continue;

    try {
      const recipients = await prisma.accessControlReportRecipient.findMany({
        where: { installationId: cfg.installationId, isActive: true },
        select: { email: true, name: true },
      });
      if (recipients.length === 0) continue;

      const { html, periodLabel } = await renderAccessControlReport({
        tenantId: cfg.tenantId,
        installationId: cfg.installationId,
        installationName: cfg.installation.name,
        schedule: cfg.autoReportSchedule!,
        now,
      });

      await sendEmailWithRetry(
        {
          from: "Opai <noreply@opai.cl>",
          to: recipients.map((r) => r.email),
          subject: `Reporte ${periodLabel} de control de acceso — ${cfg.installation.name}`,
          html,
        },
        {
          tenantId: cfg.tenantId,
          purpose: "access_control_report",
          refId: cfg.installationId,
        }
      );

      await prisma.accessControlConfig.update({
        where: { installationId: cfg.installationId },
        data: { autoReportLastSentAt: now },
      });
      sent.push(cfg.installationId);
    } catch (err) {
      console.error(
        "[AccessControl] Cron report error:",
        cfg.installationId,
        err
      );
      errors.push({ installationId: cfg.installationId, error: String(err) });
    }
  }

  return NextResponse.json({ success: true, sent, errors });
}

function shouldSendNow(
  schedule: string,
  lastSentAt: Date | null,
  now: Date
): boolean {
  // Solo dispara entre 06:00 y 09:00 hora local del servidor (cron corre a las 07:00 UTC)
  const hour = now.getHours();
  if (hour < 6 || hour > 9) return false;

  if (!lastSentAt) return true;
  const hoursSince =
    (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60);

  if (schedule === "daily") return hoursSince >= 23;
  if (schedule === "weekly") return hoursSince >= 24 * 6 && now.getDay() === 1; // Lunes
  if (schedule === "monthly")
    return hoursSince >= 24 * 27 && now.getDate() === 1;
  return false;
}
