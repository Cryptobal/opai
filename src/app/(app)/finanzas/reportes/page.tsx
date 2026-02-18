import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { ReportesClient } from "@/components/finance/ReportesClient";

export default async function ReportesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/reportes");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "reportes")) redirect("/finanzas/rendiciones");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canExport = hasCapability(perms, "rendicion_export");

  // Summary data
  const [byStatus, byType, monthlyData] = await Promise.all([
    prisma.financeRendicion.groupBy({
      by: ["status"],
      where: { tenantId },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.financeRendicion.groupBy({
      by: ["type"],
      where: { tenantId },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Monthly aggregation using raw query for last 12 months
    prisma.$queryRaw<
      { month: string; total: number; count: number }[]
    >`
      SELECT
        to_char(date, 'YYYY-MM') AS month,
        COALESCE(SUM(amount), 0)::int AS total,
        COUNT(*)::int AS count
      FROM finance.finance_rendiciones
      WHERE tenant_id = ${tenantId}
        AND date >= NOW() - INTERVAL '12 months'
      GROUP BY to_char(date, 'YYYY-MM')
      ORDER BY month ASC
    `,
  ]);

  const statusSummary = byStatus.map((g) => ({
    status: g.status,
    count: g._count.id,
    amount: g._sum.amount ?? 0,
  }));

  const typeSummary = byType.map((g) => ({
    type: g.type,
    count: g._count.id,
    amount: g._sum.amount ?? 0,
  }));

  const monthlySummary = monthlyData.map((m) => ({
    month: m.month,
    total: Number(m.total),
    count: Number(m.count),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Resumen y análisis de rendiciones."
      />
      <ReportesClient
        statusSummary={statusSummary}
        typeSummary={typeSummary}
        monthlySummary={monthlySummary}
        canExport={canExport}
      />
    </div>
  );
}
