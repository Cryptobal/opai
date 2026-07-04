/**
 * API Route: /api/cron/docs-expiry-digest
 * GET - Digest diario de vencimientos de documentos (Fase 18).
 *
 * Corre CADA HORA; para cada tenant envía UNA vez al día cuando la hora local
 * (America/Santiago) coincide con `digestHour` de su política (default 07:00).
 * El digest agrupa operacionales (por instalación) y de guardia (por guardia):
 * "📋 N documentos requieren atención: X vencidos · Y esta semana · Z este mes".
 * Los hitos T-30..T-3 viven SOLO aquí (no generan tarjetas individuales).
 *
 * Idempotencia: bell/email/push por Setting docs_expiry_digest_last (dayKey);
 * Slack por dedupe del outbox. Sin documentos en ventana → no se envía nada.
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { getExpiryPolicy, todayUtc } from "@/lib/documents/expiry-engine";
import { buildExpiryDigestSummary, digestHeadline } from "@/lib/documents/expiry-digest";
import { postDocsDigestToSlack } from "@/lib/integrations/slack/docs/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LAST_SENT_KEY = "docs_expiry_digest_last";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 }
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
    }).format(now)
  );
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);

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
        const policy = await getExpiryPolicy(tenant.id);
        if (chileHour !== policy.digestHour) {
          skipped++;
          continue;
        }
        if (await alreadySentToday(tenant.id, dayKey)) {
          skipped++;
          continue;
        }

        const summary = await buildExpiryDigestSummary(tenant.id, todayUtc(now));
        if (summary.total === 0) {
          // Cero fatiga: sin documentos en ventana no hay digest. Se marca el día
          // para no recomputar en reruns de la misma hora.
          await markSentToday(tenant.id, dayKey);
          skipped++;
          continue;
        }

        const headline = digestHeadline(summary);
        // Bell/email/push según preferencias personales; el Slack de canal va
        // aparte con blocks ricos (skipSlack evita la tarjeta genérica duplicada).
        await notify({
          tenantId: tenant.id,
          type: "docs_expiry_digest",
          title: `📋 ${summary.total} documento(s) requieren atención`,
          body: headline,
          link: "/opai/documentos-operativos",
          data: { skipSlack: true, dayKey, total: summary.total },
        });
        await postDocsDigestToSlack(tenant.id, summary, dayKey);
        await markSentToday(tenant.id, dayKey);
        sent++;
      } catch (err) {
        errors++;
        console.error(`[docs-expiry-digest] Error for tenant ${tenant.id}:`, err);
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
    console.error("[docs-expiry-digest] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
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
      data: { key, value: dayKey, type: "string", category: "docs", tenantId },
    });
  }
}
