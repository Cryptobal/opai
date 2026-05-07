import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { BookOpen } from "lucide-react";
import { AccountDrillClient } from "@/components/finance/reports/AccountDrillClient";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";
import { getExtendedLedger } from "@/modules/finance/reports/ledger-extended.service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountLedgerPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/opai/login");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const account = await prisma.financeAccountPlan.findFirst({
    where: { tenantId: session.user.tenantId, id: accountId },
    select: { id: true, code: true, name: true, type: true, nature: true },
  });
  if (!account) notFound();

  const period = buildPeriod("year", new Date());
  const initial = await getExtendedLedger(session.user.tenantId, accountId, period);

  return (
    <div className="space-y-5">
      <PageHero
        icon={<BookOpen />}
        iconTone="sky"
        title={`${account.code} · ${account.name}`}
        subtitle={account.type.toLowerCase()}
        description="Movimientos detallados con saldo acumulado."
        backHref="/finanzas/reportes/mayor"
      />
      <AccountDrillClient accountId={accountId} initialPeriod={period} initialData={initial} />
    </div>
  );
}
