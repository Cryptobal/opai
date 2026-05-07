import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Scale } from "lucide-react";
import { BalanceSheetClient } from "@/components/finance/reports/BalanceSheetClient";
import { getBalanceSheet } from "@/modules/finance/reports/balance-sheet.service";
import { toISO } from "@/modules/finance/reports/shared/period.helper";

export const dynamic = "force-dynamic";

export default async function BalancePage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes/balance");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const asOf = toISO(lastDayOfMonth);
  const initial = await getBalanceSheet(session.user.tenantId, asOf, {}, {
    withPriorMonth: true,
  });

  return (
    <div className="space-y-5">
      <PageHero
        icon={<Scale />}
        iconTone="emerald"
        eyebrow={["Finanzas", "Reportes"]}
        title="Balance General"
        subtitle="situación patrimonial"
        description="Activo, pasivo y patrimonio a la fecha de corte. Solo asientos POSTED."
      />
      <BalanceSheetClient initialAsOf={asOf} initialData={initial} initialCompare />
    </div>
  );
}
