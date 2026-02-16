import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

// ── GET: accounting module status summary ──

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance", "contabilidad")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver configuración contable" },
        { status: 403 },
      );
    }

    const [accountCount, periodCount, openPeriods, entryCount] = await Promise.all([
      prisma.financeAccountPlan.count({ where: { tenantId: ctx.tenantId } }),
      prisma.financeAccountingPeriod.count({ where: { tenantId: ctx.tenantId } }),
      prisma.financeAccountingPeriod.findMany({
        where: { tenantId: ctx.tenantId, status: "OPEN" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      prisma.financeJournalEntry.count({ where: { tenantId: ctx.tenantId } }),
    ]);

    const dteProvider = process.env.DTE_PROVIDER ?? "STUB";
    const bankProvider = process.env.BANK_PROVIDER ?? "MANUAL";

    return NextResponse.json({
      success: true,
      data: {
        chartOfAccounts: { count: accountCount, seeded: accountCount > 0 },
        periods: { total: periodCount, open: openPeriods },
        journalEntries: { total: entryCount },
        providers: { dte: dteProvider, bank: bankProvider },
      },
    });
  } catch (error) {
    console.error("[Finance] Error getting accounting config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el estado de la configuración contable" },
      { status: 500 },
    );
  }
}
