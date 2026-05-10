import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const ACTIVE_QUOTE_STATUSES = ["accepted", "active", "in_progress", "approved"];

interface AutoSource {
  kind: "QUOTE" | "PAYROLL" | "TE_LOTE" | "DTE";
  id: string;
  label: string;
  description: string | null;
  monthlyAmount: number;
  link: string;
}

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
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    if (!cat) {
      return NextResponse.json({ success: false, error: "Categoría no encontrada" }, { status: 404 });
    }

    const sources: AutoSource[] = [];

    if (cat.code === "ING_VENTA_CONTRATO") {
      const quotes = await prisma.cpqQuote.findMany({
        where: {
          tenantId: ctx.tenantId,
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
          accountId: true,
          installation: { select: { id: true, name: true } },
        },
      });
      for (const q of quotes) {
        sources.push({
          kind: "QUOTE",
          id: q.id,
          label: q.installation?.name ?? q.clientName ?? q.name ?? q.code,
          description: `${q.code} · ${q.currency} ${Number(q.monthlyCost).toLocaleString("es-CL")}/mes`,
          monthlyAmount: Number(q.monthlyCost),
          link: q.accountId
            ? `/crm/cuentas/${q.accountId}#cashflow-quote-${q.id}`
            : `/cpq/cotizaciones/${q.id}`,
        });
      }
    }

    return NextResponse.json({ success: true, data: { categoryCode: cat.code, sources } });
  } catch (error) {
    console.error("[Finance/Cashflow] GET auto-sources:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
