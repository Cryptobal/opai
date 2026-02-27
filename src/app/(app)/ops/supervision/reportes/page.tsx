import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Button } from "@/components/ui/button";
import { SupervisionReportes } from "@/components/supervision/SupervisionReportes";
import { getPeriodBounds, PERIOD_OPTIONS } from "@/lib/supervision-periods";

export default async function SupervisionReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/reportes");
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
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Reportes de supervisión"
        description="Visualización de KPIs, tendencias y comparativas de supervisión."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ops/supervision">Dashboard</Link>
          </Button>
        }
      />

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
