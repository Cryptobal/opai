import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";
import { BookOpen } from "lucide-react";
import { LedgerClient } from "@/components/finance/reports/LedgerClient";
import { listAccountsForLedger } from "@/modules/finance/reports/ledger-extended.service";

export const dynamic = "force-dynamic";

export default async function LedgerListPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/reportes/mayor");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const accounts = await listAccountsForLedger(session.user.tenantId);

  return (
    <div className="space-y-5">
      <PageHero
        icon={<BookOpen />}
        iconTone="sky"
        title="Libro Mayor"
        subtitle="por cuenta"
        description="Movimientos posteados con saldo running y filtro por centro de costo."
      />
      <FinanceN3Chips submoduleKey="finance-informes" />
      <LedgerClient accounts={accounts} />
    </div>
  );
}
