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
import { ConciliacionClient } from "@/components/finance/ConciliacionClient";

export default async function ConciliacionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/conciliacion");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "contabilidad")) redirect("/finanzas/rendiciones");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canManage = hasCapability(perms, "rendicion_configure");

  const bankAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, bankName: true, accountNumber: true },
    orderBy: { bankName: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciliación Bancaria"
        description="Conciliación de movimientos bancarios con registros contables."
      />
      <ConciliacionClient bankAccounts={bankAccounts} canManage={canManage} />
    </div>
  );
}
