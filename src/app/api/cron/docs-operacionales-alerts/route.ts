/**
 * API Route: /api/cron/docs-operacionales-alerts
 * GET - Vencimientos de documentos operacionales sobre el motor de hitos.
 *
 * Fase 18: las tarjetas individuales se emiten SOLO al cruzar un hito y solo
 * para día 0 / vencidos (todos los tipos) y T-7/T-1 de tipos crítico-legal.
 * Los hitos T-30..T-3 viven únicamente en el digest diario
 * (/api/cron/docs-expiry-digest). Entre hitos: silencio.
 *
 * Cubre documentos globales (capa="global") y por instalación (capa="instalacion").
 * Respeta `tipo.diasAlerta` como techo de la escalera.
 *
 * Corre diariamente vía Vercel Cron. Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { calcDocStatus } from "@/lib/docs-operacionales";
import {
  collectOperacionalItems,
  describeDue,
  getExpiryPolicy,
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
    let statusUpdates = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const result = await processTenant(tenant.id);
        cardsSent += result.run.cardsSent;
        digestOnly += result.run.digestOnly;
        overflow += result.run.overflow;
        statusUpdates += result.statusUpdates;
        errors += result.run.errors;
      } catch (err) {
        errors++;
        console.error(`[docs-operacionales-alerts] Error for tenant ${tenant.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      tenants: tenants.length,
      cardsSent,
      digestOnly,
      overflow,
      statusUpdates,
      errors,
    });
  } catch (error) {
    console.error("[docs-operacionales-alerts] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function processTenant(
  tenantId: string
): Promise<{ run: ExpiryRunResult; statusUpdates: number }> {
  const today = todayUtc();
  const [policy, items] = await Promise.all([
    getExpiryPolicy(tenantId),
    collectOperacionalItems(tenantId, today),
  ]);

  // Actualiza el status DB si diverge del cálculo actual (defensa vs. cron de status no programado)
  let statusUpdates = 0;
  for (const item of items) {
    const computed = calcDocStatus(item.expiresAt, true, item.diasAlerta);
    if (computed !== item.status) {
      await prisma.docOperacional.update({
        where: { id: item.id },
        data: { status: computed },
      });
      statusUpdates++;
    }
  }

  const run = await runExpiryMilestones({
    tenantId,
    items,
    policy,
    today,
    sendCard: async (item) => {
      const expired = item.daysRemaining < 0;
      const dueText = describeDue(item.daysRemaining, item.expiresAt);
      await notify({
        tenantId,
        type: expired ? "doc_operacional_expired" : "doc_operacional_expiring",
        title: expired
          ? `Documento vencido: ${item.label}`
          : `Documento por vencer: ${item.label}`,
        body: expired
          ? `${item.label} (${item.contextLabel}) ${dueText}. Requiere renovación.`
          : `${item.label} (${item.contextLabel}) ${dueText}.`,
        link: item.link,
        data: {
          docOperacionalId: item.id,
          tipoId: item.tipoId,
          installationId: item.installationId,
          expiresAt: item.expiresAt,
          daysRemaining: item.daysRemaining,
        },
      });
    },
  });

  return { run, statusUpdates };
}
