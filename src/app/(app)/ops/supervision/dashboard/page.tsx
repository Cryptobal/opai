import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { BarChart3 } from "lucide-react";
import { SupervisionDashboardEnhanced } from "@/components/supervision/SupervisionDashboardEnhanced";
import { SupervisionReportes } from "@/components/supervision/SupervisionReportes";
import { getPeriodBounds, PERIOD_OPTIONS } from "@/lib/supervision-periods";
export default async function SupervisionDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/dashboard");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const params = await searchParams;
  const periodKey = params.period ?? "30d";
  const { dateFrom, dateTo, label: periodLabel } = getPeriodBounds(periodKey);

  const canViewAll = hasCapability(perms, "supervision_view_all");

  return (
    <div className="space-y-4 min-w-0">
      <PageHero
        icon={<BarChart3 />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Supervisión", "Dashboard"]}
        title="Dashboard"
        subtitle="KPIs y tendencias"
        description="Indicadores consolidados, tendencias temporales y reportes de visitas de supervisión."
      />

      <SupervisionDashboardEnhanced
        periodLabel={periodLabel}
        periodOptions={PERIOD_OPTIONS}
        canViewAll={canViewAll}
        dateFrom={dateFrom.toISOString().slice(0, 10)}
        dateTo={dateTo.toISOString().slice(0, 10)}
      />

      {/* Reportes consolidados */}
      <SupervisionReportes
        periodLabel={periodLabel}
        periodOptions={PERIOD_OPTIONS}
        canViewAll={canViewAll}
        dateFrom={dateFrom.toISOString().slice(0, 10)}
        dateTo={dateTo.toISOString().slice(0, 10)}
      />
    </div>
  );
}
