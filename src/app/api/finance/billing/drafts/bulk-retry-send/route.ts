/**
 * POST /api/finance/billing/drafts/bulk-retry-send
 *
 * Reintenta el envío de Proforma y/o Estado de Pago para múltiples borradores
 * con *_status='NONE'. Si el draft tiene recipient_contact_ids vacío pero la
 * plantilla recurrente origen ahora tiene destinatarios cargados (porque el
 * usuario los agregó después del cron), copiamos del template al draft antes
 * de disparar el envío.
 *
 * Permisos: facturacion_resend_email | facturacion_create_draft | facturacion_issue
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendBillingDocument } from "@/modules/finance/billing/billing-document-send.service";

const schema = z.object({
  draftIds: z.array(z.string().uuid()).min(1).max(200),
  variants: z.array(z.enum(["PROFORMA", "ESTADO_DE_PAGO"])).min(1),
});

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (
    !hasFacturacionCapability(perms, "facturacion_resend_email") &&
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;
  const { draftIds, variants } = parsed.data;

  const results: Array<{
    draftId: string;
    variant: "PROFORMA" | "ESTADO_DE_PAGO";
    success: boolean;
    error?: string;
    backfilledFromTemplate?: boolean;
  }> = [];

  for (const draftId of draftIds) {
    const draft = await prisma.financeDte.findFirst({
      where: { id: draftId, tenantId: ctx.tenantId, siiStatus: "DRAFT" },
      select: {
        id: true,
        proformaRecipientContactIds: true,
        estadoPagoRecipientContactIds: true,
      },
    });
    if (!draft) {
      for (const v of variants) {
        results.push({
          draftId,
          variant: v,
          success: false,
          error: "Borrador no encontrado",
        });
      }
      continue;
    }

    // Buscar la plantilla origen vía último FinanceDteRecurringRun que apunta
    // a este draft. Si los destinatarios fueron agregados a la plantilla
    // después del cron, los copiamos al draft para que el envío use esos.
    const lastRun = await prisma.financeDteRecurringRun.findFirst({
      where: { tenantId: ctx.tenantId, dteId: draftId },
      orderBy: { ranAt: "desc" },
      select: { template: { select: { recipientContactIds: true } } },
    });
    const templateRecipients = lastRun?.template?.recipientContactIds ?? [];

    let currentProformaIds = draft.proformaRecipientContactIds;
    let currentEstadoPagoIds = draft.estadoPagoRecipientContactIds;

    for (const variant of variants) {
      const currentIds =
        variant === "PROFORMA" ? currentProformaIds : currentEstadoPagoIds;

      let backfilledFromTemplate = false;
      if (currentIds.length === 0 && templateRecipients.length > 0) {
        await prisma.financeDte.update({
          where: { id: draft.id },
          data:
            variant === "PROFORMA"
              ? { proformaRecipientContactIds: templateRecipients }
              : { estadoPagoRecipientContactIds: templateRecipients },
        });
        backfilledFromTemplate = true;
        if (variant === "PROFORMA") currentProformaIds = templateRecipients;
        else currentEstadoPagoIds = templateRecipients;
      }

      try {
        const res = await sendBillingDocument(ctx.tenantId, {
          dteId: draft.id,
          variant,
          triggeredBy: ctx.userId,
          isAutoFromCron: false,
        });
        results.push({
          draftId,
          variant,
          success: res.success,
          error: res.success ? undefined : res.error,
          backfilledFromTemplate,
        });
      } catch (err) {
        results.push({
          draftId,
          variant,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          backfilledFromTemplate,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      okCount: results.filter((r) => r.success).length,
      failCount: results.filter((r) => !r.success).length,
      backfillCount: results.filter((r) => r.backfilledFromTemplate).length,
      results,
    },
  });
}
