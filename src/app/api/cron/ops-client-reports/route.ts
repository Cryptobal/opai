import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildAndSendDigest,
  collectDigestReport,
  periodForFrequency,
  shouldSendNow,
  type ReportFrequency,
} from "@/lib/ops/client-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const configs = await prisma.opsClientReportConfig.findMany({
    where: { enabled: true },
    include: {
      installation: {
        select: { name: true, accountId: true },
      },
    },
  });

  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ installationId: string; error: string }> = [];

  for (const cfg of configs) {
    const decision = shouldSendNow(
      {
        enabled: cfg.enabled,
        frequency: (cfg.frequency === "monthly" ? "monthly" : "weekly") as ReportFrequency,
        weekday: cfg.weekday,
        dayOfMonth: cfg.dayOfMonth,
        sendHourChile: cfg.sendHourChile,
        lastPeriodKey: cfg.lastPeriodKey,
      },
      now
    );
    if (!decision.send) {
      skipped.push(cfg.installationId);
      continue;
    }

    try {
      const recipients = await prisma.opsClientReportRecipient.findMany({
        where: { installationId: cfg.installationId, isActive: true },
        select: { email: true },
      });
      if (recipients.length === 0) {
        skipped.push(cfg.installationId);
        continue;
      }

      const data = await collectDigestReport({
        tenantId: cfg.tenantId,
        installationId: cfg.installationId,
        period: decision.period,
        sections: {
          includeAsistencia: cfg.includeAsistencia,
          includeCobertura: cfg.includeCobertura,
          includeRondas: cfg.includeRondas,
          includeIncidentes: cfg.includeIncidentes,
          includeVisitas: cfg.includeVisitas,
        },
      });

      const result = await buildAndSendDigest({
        tenantId: cfg.tenantId,
        installationId: cfg.installationId,
        accountId: cfg.installation.accountId,
        periodKey: decision.period.key,
        data,
        to: recipients.map((r) => r.email),
      });

      if (!result.ok) {
        errors.push({
          installationId: cfg.installationId,
          error: result.error ?? "send_failed",
        });
        continue;
      }

      await prisma.opsClientReportConfig.update({
        where: { id: cfg.id },
        data: {
          lastSentAt: now,
          lastPeriodKey: decision.period.key,
        },
      });
      sent.push(cfg.installationId);
    } catch (err) {
      console.error("[ClientReport] Cron error:", cfg.installationId, err);
      errors.push({
        installationId: cfg.installationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ success: true, sent, skipped: skipped.length, errors });
}
