import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { TrendingUp } from "lucide-react";
import { ProfitabilityClient } from "@/components/finance/reports/ProfitabilityClient";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";
import { getProfitability } from "@/modules/finance/reports/profitability.service";

export const dynamic = "force-dynamic";

export default async function RentabilidadPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes/rentabilidad");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const period = buildPeriod("year", new Date());
  const initial = await getProfitability(session.user.tenantId, period);

  return (
    <div className="space-y-5">
      <PageHero
        icon={<TrendingUp />}
        iconTone="amber"
        title="Rentabilidad por cliente"
        subtitle="ranking margen"
        description="Margen unitario por centro de costo, con prorrateo de gastos generales."
      />
      <ProfitabilityClient initialPeriod={period} initialData={initial} />
    </div>
  );
}
