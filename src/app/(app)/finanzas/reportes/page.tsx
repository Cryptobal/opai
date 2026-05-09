import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { LayoutDashboard } from "lucide-react";
import { DashboardClient } from "@/components/finance/reports/DashboardClient";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";
import { getDashboardKpis } from "@/modules/finance/reports/dashboard.service";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  // Informes financieros: solo owner/admin (reports_finance_view) o quien
  // tenga finance_reports_view explícitamente.
  if (
    !hasCapability(perms, "reports_finance_view") &&
    !hasCapability(perms, "finance_reports_view") &&
    !canView(perms, "finance", "reportes")
  ) {
    redirect("/finanzas");
  }

  const period = buildPeriod("month", new Date());
  const initialKpis = await getDashboardKpis(session.user.tenantId, period);

  return (
    <div className="space-y-5">
      <PageHero
        icon={<LayoutDashboard />}
        iconTone="sky"
        title="Dashboard ejecutivo"
        subtitle="visión 360°"
        description="KPIs clave, tendencias y rankings en tiempo real."
      />
      <DashboardClient initialPeriod={period} initialKpis={initialKpis} />
    </div>
  );
}
