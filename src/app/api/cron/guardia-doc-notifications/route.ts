/**
 * API Route: /api/cron/guardia-doc-notifications
 * GET - Check for guardia documents expiring or expired, create notifications
 *
 * Runs daily via Vercel Cron. Protected with CRON_SECRET.
 * Replaces the side-effect that previously ran inside GET /api/notifications.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";
import { notify } from "@/lib/notifications/notify";
import { GUARDIA_ALERTING_LIFECYCLE_STATUSES } from "@/lib/personas";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const result = await processGuardiaDocExpiryNotifications(tenant.id);
        created += result.created;
        skipped += result.skipped;
      } catch (err) {
        errors++;
        console.error(`[guardia-doc-notifications] Error for tenant ${tenant.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      tenants: tenants.length,
      created,
      skipped,
      errors,
    });
  } catch (error) {
    console.error("[guardia-doc-notifications] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function processGuardiaDocExpiryNotifications(tenantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const config = await getGuardiaDocumentosConfig(tenantId);
  const byType = new Map(
    config.filter((c) => c.hasExpiration).map((c) => [c.code, c.alertDaysBefore])
  );

  const maxDays = Math.max(30, ...Array.from(byType.values()));
  const limitDate = addDays(today, maxDays);

  const docs = await prisma.opsDocumentoPersona.findMany({
    where: {
      tenantId,
      expiresAt: { not: null, lte: limitDate },
      status: { not: "vencido" },
      guardia: {
        status: "active",
        lifecycleStatus: { in: [...GUARDIA_ALERTING_LIFECYCLE_STATUSES] },
      },
    },
    include: {
      guardia: {
        include: {
          persona: { select: { firstName: true, lastName: true } },
        },
      },
    },
    take: 200,
  });

  let created = 0;
  let skipped = 0;

  for (const doc of docs) {
    if (!doc.expiresAt) continue;
    const alertDays = byType.get(doc.type);
    if (alertDays === undefined) continue;
    const expiresAt = new Date(doc.expiresAt);
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysRemaining > alertDays) continue;

    const type = daysRemaining < 0 ? "guardia_doc_expired" : "guardia_doc_expiring";
    const personName = `${doc.guardia.persona.firstName} ${doc.guardia.persona.lastName}`.trim();
    const title =
      daysRemaining < 0
        ? `Documento vencido de guardia: ${personName}`
        : `Documento por vencer de guardia: ${personName}`;
    const message =
      daysRemaining < 0
        ? `${doc.type} venció y requiere renovación.`
        : `${doc.type} vence en ${daysRemaining} día(s).`;

    // Improved deduplication: check by document ID (not just by time window)
    const existing = await prisma.notification.findFirst({
      where: {
        tenantId,
        type,
        data: { path: ["guardiaDocumentId"], equals: doc.id },
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Cross-dedup: si ya existe un hallazgo de supervisión abierto sobre este
    // mismo doc del guardia, vincular la notificación al ticket en curso para
    // que el usuario sepa que ambos avisos hablan del mismo problema.
    const linkedFinding = await prisma.opsSupervisionFinding.findFirst({
      where: {
        tenantId,
        guardId: doc.guardiaId,
        guardiaDocCode: doc.type,
        ticket: { status: { notIn: ["closed", "resolved"] } },
      },
      include: { ticket: { select: { code: true, id: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });

    const bodyExtra = linkedFinding?.ticket
      ? `\n\nYa existe ticket abierto sobre este hallazgo: ${linkedFinding.ticket.code}.`
      : "";

    await notify({
      tenantId,
      type,
      title,
      body: message + bodyExtra,
      link: `/personas/guardias/${doc.guardiaId}?tab=operaciones&doc=${doc.id}`,
      emailSecondaryAction: linkedFinding?.ticket
        ? {
            url: `/opai/ops/tickets/${linkedFinding.ticket.id}`,
            label: `Ver ticket ${linkedFinding.ticket.code}`,
            color: "#0066FF",
          }
        : undefined,
      data: {
        guardiaId: doc.guardiaId,
        guardiaDocumentId: doc.id,
        expiresAt: doc.expiresAt,
        docType: doc.type,
        linkedFindingId: linkedFinding?.id ?? null,
        linkedTicketId: linkedFinding?.ticket?.id ?? null,
        linkedTicketCode: linkedFinding?.ticket?.code ?? null,
      },
    });
    created++;
  }

  return { created, skipped };
}
