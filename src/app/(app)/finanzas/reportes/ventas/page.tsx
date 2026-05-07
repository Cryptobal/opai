import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Grid3x3 } from "lucide-react";
import { SalesMatrixClient } from "@/components/finance/reports/SalesMatrixClient";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";
import { getSalesMatrix } from "@/modules/finance/reports/sales-matrix.service";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes/ventas");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const period = buildPeriod("year", new Date());
  const initial = await getSalesMatrix(session.user.tenantId, period);

  return (
    <div className="space-y-5">
      <PageHero
        icon={<Grid3x3 />}
        iconTone="emerald"
        title="Ventas por cliente"
        subtitle="heatmap mensual"
        description="Facturación por centro de costo (CrmAccount) por mes. Espejo F29."
      />
      <SalesMatrixClient initialPeriod={period} initialData={initial} />
    </div>
  );
}
