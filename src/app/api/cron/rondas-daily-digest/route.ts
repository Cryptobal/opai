/**
 * API Route: /api/cron/rondas-daily-digest
 * GET - Digest diario de cumplimiento de rondas (Fase 19).
 *
 * Corre CADA HORA; para cada tenant envía UNA vez al día cuando la hora local
 * (America/Santiago) coincide con `digestHour` de su política (Setting
 * rondas_notif_policy, default 08:00). Reporta el DÍA ANTERIOR completo:
 * "🛡️ Rondas de ayer: NN% cumplimiento (X de Y realizadas)" + desglose por
 * instalación de peor a mejor con semáforo (umbrales configurables).
 *
 * Cumplimiento = completadas ÷ programadas del día (ver daily-digest.ts).
 * Idempotencia: bell/email/push por Setting rondas_daily_digest_last (dayKey);
 * Slack por dedupe del outbox. Tenant sin rondas programadas ayer → nada.
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { getRondasNotifPolicy } from "@/lib/rondas/notification-policy";
import { buildRondasDigestSummary, digestHeadline, installationLine } from "@/lib/rondas/daily-digest";
import { startOfDayChile, endOfDayChile } from "@/lib/rondas/timezone";
import { postRondasDigestToSlack } from "@/lib/integrations/slack/rondas-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LAST_SENT_KEY = "rondas_daily_digest_last";
const MAX_BODY_LINES = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const chileHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);

  // "Ayer" en Chile: el mismo instante menos 24h, normalizado a día completo local.
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dayStart = startOfDayChile(yesterday);
  const dayEnd = endOfDayChile(yesterday);

  try {
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const policy = await getRondasNotifPolicy(tenant.id);
        if (chileHour !== policy.digestHour) {
          skipped++;
          continue;
        }
        if (await alreadySentToday(tenant.id, dayKey)) {
          skipped++;
          continue;
        }

        const summary = await buildRondasDigestSummary(tenant.id, dayStart, dayEnd);
        if (summary.total === 0) {
          // Sin rondas programadas ayer no hay nada que reportar. Se marca el
          // día para no recomputar en reruns de la misma hora.
          await markSentToday(tenant.id, dayKey);
          skipped++;
          continue;
        }

        const lines = summary.installations
          .slice(0, MAX_BODY_LINES)
          .map((i) => installationLine(i, policy));
        const rest = summary.installations.length - lines.length;
        if (rest > 0) lines.push(`…y ${rest} más`);

        // Bell/email/push según preferencias; el Slack de canal va aparte con
        // blocks ricos (skipSlack evita la tarjeta genérica duplicada).
        await notify({
          tenantId: tenant.id,
          type: "rondas_daily_digest",
          title: `🛡️ ${digestHeadline(summary)}`,
          body: lines.join("\n"),
          link: "/ops/rondas/reportes",
          data: { skipSlack: true, dayKey, pct: summary.pct, total: summary.total },
        });
        await postRondasDigestToSlack(tenant.id, summary, policy, dayKey);
        await markSentToday(tenant.id, dayKey);
        sent++;
      } catch (err) {
        errors++;
        console.error(`[rondas-daily-digest] Error for tenant ${tenant.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      tenants: tenants.length,
      chileHour,
      sent,
      skipped,
      errors,
    });
  } catch (error) {
    console.error("[rondas-daily-digest] Fatal error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

async function alreadySentToday(tenantId: string, dayKey: string): Promise<boolean> {
  const setting = await prisma.setting.findFirst({
    where: { key: `${LAST_SENT_KEY}:${tenantId}`, tenantId },
    select: { value: true },
  });
  return setting?.value === dayKey;
}

async function markSentToday(tenantId: string, dayKey: string): Promise<void> {
  const key = `${LAST_SENT_KEY}:${tenantId}`;
  const existing = await prisma.setting.findFirst({ where: { key, tenantId }, select: { id: true } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value: dayKey } });
  } else {
    await prisma.setting.create({
      data: { key, value: dayKey, type: "string", category: "rondas", tenantId },
    });
  }
}
