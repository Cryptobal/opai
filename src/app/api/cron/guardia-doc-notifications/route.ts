/**
 * API Route: /api/cron/guardia-doc-notifications
 * GET - Vencimientos de documentos de guardia sobre el motor de hitos.
 *
 * Fase 18: las tarjetas individuales se emiten SOLO al cruzar un hito y solo
 * para día 0 / vencidos (todos los tipos) y T-7/T-1 de tipos crítico-legal
 * (config `criticoLegal` en ops_guardia_documentos_config). Los hitos
 * T-30..T-3 viven únicamente en el digest diario. Entre hitos: silencio.
 *
 * Corre diariamente vía Vercel Cron. Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import {
  collectGuardiaItems,
  describeDue,
  getExpiryPolicy,
  resolveEscalationTargets,
  runExpiryMilestones,
  todayUtc,
  type ExpiryRunResult,
} from "@/lib/documents/expiry-engine";

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

    let cardsSent = 0;
    let digestOnly = 0;
    let overflow = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const result = await processTenant(tenant.id);
        cardsSent += result.cardsSent;
        digestOnly += result.digestOnly;
        overflow += result.overflow;
        errors += result.errors;
      } catch (err) {
        errors++;
        console.error(`[guardia-doc-notifications] Error for tenant ${tenant.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      tenants: tenants.length,
      cardsSent,
      digestOnly,
      overflow,
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

async function processTenant(tenantId: string): Promise<ExpiryRunResult> {
  const today = todayUtc();
  const [policy, items] = await Promise.all([
    getExpiryPolicy(tenantId),
    collectGuardiaItems(tenantId, today),
  ]);

  return runExpiryMilestones({
    tenantId,
    items,
    policy,
    today,
    sendCard: async (item) => {
      const expired = item.daysRemaining < 0;
      const type = expired ? "guardia_doc_expired" : "guardia_doc_expiring";
      const title = expired
        ? `Documento vencido de guardia: ${item.contextLabel}`
        : `Documento por vencer de guardia: ${item.contextLabel}`;
      const message = expired
        ? `${item.label} venció y requiere renovación.`
        : item.daysRemaining === 0
          ? `${item.label} vence hoy.`
          : `${item.label} vence en ${item.daysRemaining} día(s).`;

      // Cross-dedup: si ya existe un hallazgo de supervisión abierto sobre este
      // mismo doc del guardia, vincular la notificación al ticket en curso para
      // que el usuario sepa que ambos avisos hablan del mismo problema.
      const linkedFinding = await prisma.opsSupervisionFinding.findFirst({
        where: {
          tenantId,
          guardId: item.guardiaId ?? "",
          guardiaDocCode: item.docTypeCode ?? "",
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
        link: item.link,
        emailSecondaryAction: linkedFinding?.ticket
          ? {
              url: `/ops/tickets/${linkedFinding.ticket.id}`,
              label: `Ver ticket ${linkedFinding.ticket.code}`,
              color: "#0066FF",
            }
          : undefined,
        data: {
          guardiaId: item.guardiaId,
          guardiaDocumentId: item.id,
          expiresAt: item.expiresAt,
          docType: item.docTypeCode,
          daysRemaining: item.daysRemaining,
          docRef: `guardia:${item.id}`, // habilita los botones de gestión en la tarjeta Slack
          linkedFindingId: linkedFinding?.id ?? null,
          linkedTicketId: linkedFinding?.ticket?.id ?? null,
          linkedTicketCode: linkedFinding?.ticket?.code ?? null,
        },
      });
    },
    sendEscalation: async (item, evaluation) => {
      const targets = await resolveEscalationTargets(tenantId);
      const dueText = describeDue(item.daysRemaining, item.expiresAt);
      await notify({
        tenantId,
        type: "doc_escalated",
        ...(targets.length ? { targetIds: targets, targetType: "ADMIN" as const } : {}),
        title: `⚠️ Escalado: doc. de ${item.contextLabel} sin gestión`,
        body: `${item.label} de ${item.contextLabel} ${dueText} y cruzó T-7 sin acción (ni renovación ni "En trámite").`,
        link: item.link,
        data: {
          guardiaId: item.guardiaId,
          guardiaDocumentId: item.id,
          docType: item.docTypeCode,
          milestone: evaluation.milestone,
          daysRemaining: item.daysRemaining,
          docRef: `guardia:${item.id}`,
        },
      });
    },
  });
}
