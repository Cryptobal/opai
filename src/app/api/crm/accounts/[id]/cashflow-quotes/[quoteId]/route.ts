import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cashflowQuoteConfigSchema } from "@/lib/validations/cashflow-quote-config";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; quoteId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id, quoteId } = await context.params;
    const parsed = await parseBody(request, cashflowQuoteConfigSchema);
    if (parsed.error) return parsed.error;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId, accountId: id },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada en esta cuenta" },
        { status: 404 },
      );
    }

    if (parsed.data.installationId !== undefined && parsed.data.installationId !== null) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: parsed.data.installationId, tenantId: ctx.tenantId, accountId: id },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Instalación no pertenece a esta cuenta" },
          { status: 400 },
        );
      }
    }

    await prisma.cpqQuote.update({
      where: { id: quoteId },
      data: {
        ...(parsed.data.installationId !== undefined && {
          installationId: parsed.data.installationId,
        }),
        ...(parsed.data.paymentDayMode !== undefined && {
          paymentDayMode: parsed.data.paymentDayMode,
        }),
        ...(parsed.data.paymentDays !== undefined && {
          paymentDays: parsed.data.paymentDays,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CRM/Account] PATCH cashflow-quote:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
