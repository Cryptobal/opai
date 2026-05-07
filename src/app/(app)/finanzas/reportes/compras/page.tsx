import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Receipt } from "lucide-react";
import { PurchasesMatrixClient } from "@/components/finance/reports/PurchasesMatrixClient";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";
import { getPurchasesMatrix } from "@/modules/finance/reports/purchases-matrix.service";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes/compras");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const period = buildPeriod("year", new Date());
  const initial = await getPurchasesMatrix(session.user.tenantId, period);

  return (
    <div className="space-y-5">
      <PageHero
        icon={<Receipt />}
        iconTone="rose"
        eyebrow={["Finanzas", "Reportes"]}
        title="Compras por centro de costo"
        subtitle="heatmap mensual"
        description="Compras (DTEs RECEIVED) por cliente y mes. Espejo libro IVA compras."
      />
      <PurchasesMatrixClient initialPeriod={period} initialData={initial} />
    </div>
  );
}
