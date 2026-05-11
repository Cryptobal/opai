import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const ACTIVE_QUOTE_STATUSES = ["accepted", "active", "in_progress", "approved"];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;

    const quotes = await prisma.cpqQuote.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: id,
        status: { in: ACTIVE_QUOTE_STATUSES },
        contractStartDate: { not: null },
      },
      select: {
        id: true,
        code: true,
        name: true,
        clientName: true,
        monthlyCost: true,
        currency: true,
        contractStartDate: true,
        contractDuration: true,
        paymentDays: true,
        paymentDayMode: true,
        paymentTerms: true,
        installationId: true,
        installation: { select: { id: true, name: true } },
        // Para unificar Document(plantilla) con su cotización origen en
        // el listado de contratos: matcheamos por dealId.
        dealId: true,
      },
      orderBy: { contractStartDate: "asc" },
    });

    const installations = await prisma.crmInstallation.findMany({
      where: { tenantId: ctx.tenantId, accountId: id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: { quotes, installations } });
  } catch (error) {
    console.error("[CRM/Account] GET cashflow-quotes:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
