import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { ReportsSidebar } from "@/components/finance/reports/ReportsSidebar";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }
  return (
    <div className="space-y-4 min-w-0 pb-16 lg:pb-0">
      <FinanceSubnav />
      <div className="flex gap-4 min-w-0">
        <ReportsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
