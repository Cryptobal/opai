import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Status agregado de auto-envío para un borrador:
 *   - Estado actual de Proforma / Estado de Pago.
 *   - Último intento de envío (log + error si aplica).
 *   - autoSendIssues del último FinanceDteRecurringRun que generó este draft
 *     (si vino de una plantilla recurrente).
 *
 * Usado por BorradoresTab / RecurringClient para renderizar badges sin N+1.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        requireProforma: true,
        requireEstadoPago: true,
        proformaStatus: true,
        proformaSentAt: true,
        proformaSentCount: true,
        proformaLastRecipient: true,
        estadoPagoStatus: true,
        estadoPagoSentAt: true,
        estadoPagoSentCount: true,
        estadoPagoLastRecipient: true,
      },
    });
    if (!dte) {
      return NextResponse.json(
        { success: false, error: "Borrador no encontrado" },
        { status: 404 },
      );
    }

    const logs = await prisma.financeDteEmailLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        dteId: id,
        kind: {
          in: [
            "AUTO_PROFORMA",
            "AUTO_ESTADO_PAGO",
            "MANUAL_PROFORMA",
            "MANUAL_ESTADO_PAGO",
          ],
        },
      },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        status: true,
        to: true,
        cc: true,
        subject: true,
        errorMessage: true,
        sentAt: true,
        resendId: true,
      },
    });

    const run = await prisma.financeDteRecurringRun.findFirst({
      where: { tenantId: ctx.tenantId, dteId: id },
      orderBy: { ranAt: "desc" },
      select: {
        id: true,
        templateId: true,
        status: true,
        autoSendIssues: true,
        ranAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        proforma: {
          required: dte.requireProforma,
          status: dte.proformaStatus,
          sentAt: dte.proformaSentAt,
          sentCount: dte.proformaSentCount,
          lastRecipient: dte.proformaLastRecipient,
        },
        estadoPago: {
          required: dte.requireEstadoPago,
          status: dte.estadoPagoStatus,
          sentAt: dte.estadoPagoSentAt,
          sentCount: dte.estadoPagoSentCount,
          lastRecipient: dte.estadoPagoLastRecipient,
        },
        autoSendIssues: run?.autoSendIssues ?? null,
        recurringRunId: run?.id ?? null,
        recurringRanAt: run?.ranAt ?? null,
        logs,
      },
    });
  } catch (error) {
    console.error("[finance/billing/auto-send-status] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
