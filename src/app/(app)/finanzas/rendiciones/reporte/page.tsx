import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { BarChart3 } from "lucide-react";
import { RendicionesReportClient } from "@/components/finance/RendicionesReportClient";

export default async function RendicionesReportePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/rendiciones/reporte");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "rendiciones")) redirect("/finanzas");

  const tenantId = session.user.tenantId;
  const canExport = hasCapability(perms, "rendicion_export");

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
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<BarChart3 />}
        iconTone="teal"
        eyebrow={["Finanzas", "Rendiciones", "Reporte"]}
        title="Reporte de rendiciones"
        subtitle="resumen y análisis"
        description="Resumen y análisis de rendiciones de gastos."
      />
      <RendicionesReportClient
        statusSummary={statusSummary}
        typeSummary={typeSummary}
        monthlySummary={monthlySummary}
        canExport={canExport}
      />
    </div>
  );
}
