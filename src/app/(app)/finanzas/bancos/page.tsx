import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { BancosClient } from "@/components/finance/BancosClient";

export default async function BancosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/bancos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "contabilidad")) redirect("/finanzas/rendiciones");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canManage = hasCapability(perms, "rendicion_configure");

  const bankAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId },
    include: { accountPlan: { select: { id: true, code: true, name: true } } },
    orderBy: { bankName: "asc" },
  });

  const accountPlans = await prisma.financeAccountPlan.findMany({
    where: { tenantId, isActive: true, acceptsEntries: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const data = bankAccounts.map((a) => ({
    id: a.id,
    bankCode: a.bankCode,
    bankName: a.bankName,
    accountType: a.accountType,
    accountNumber: a.accountNumber,
    currency: a.currency,
    holderName: a.holderName,
    holderRut: a.holderRut,
    currentBalance: a.currentBalance?.toNumber() ?? 0,
    isDefault: a.isDefault,
    isActive: a.isActive,
    accountPlanId: a.accountPlanId,
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Bancos"
        description="Gestión de cuentas bancarias, movimientos e importación de cartolas."
      />
      <BancosClient
        accounts={data}
        accountPlans={accountPlans}
        canManage={canManage}
      />
    </div>
  );
}
