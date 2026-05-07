import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { FileBarChart } from "lucide-react";
import { IncomeStatementClient } from "@/components/finance/reports/IncomeStatementClient";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";
import { getIncomeStatement } from "@/modules/finance/reports/income-statement.service";

export const dynamic = "force-dynamic";

export default async function EerrPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes/eerr");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const period = buildPeriod("month", new Date());
  const initial = await getIncomeStatement(session.user.tenantId, period, {}, {
    withComparison: true,
  });

  return (
    <div className="space-y-5">
      <PageHero
        icon={<FileBarChart />}
        iconTone="violet"
        title="Estado de Resultado"
        subtitle="EE.RR."
        description="Ingresos, costos y utilidad neta del período. Solo asientos POSTED."
      />
      <IncomeStatementClient initialPeriod={period} initialData={initial} initialCompare />
    </div>
  );
}
