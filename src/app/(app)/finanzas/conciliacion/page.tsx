import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ConciliacionClient } from "@/components/finance/ConciliacionClient";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";

export default async function ConciliacionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/conciliacion");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "contabilidad")) redirect("/finanzas/rendiciones");

  const tenantId = session.user.tenantId;
  const canManage = hasCapability(perms, "rendicion_configure");

  const bankAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, bankName: true, accountNumber: true },
    orderBy: { bankName: "asc" },
  });

  return (
    <div className="min-w-0 space-y-4">
      <FinanceN3Chips submoduleKey="finance-banca" />
      <ConciliacionClient bankAccounts={bankAccounts} canManage={canManage} />
    </div>
  );
}
