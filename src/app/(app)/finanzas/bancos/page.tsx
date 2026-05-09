import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Building2 } from "lucide-react";
import { BancosClient } from "@/components/finance/BancosClient";
import { tenantInboxEmail } from "@/modules/finance/banking/cartola-inbox";

export default async function BancosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/bancos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  // Banca queda restringida a propietarios/administradores. Las capabilities
  // banking_view / banking_manage se asignan automáticamente en owner (vía
  // fullPermissions) y admin (vía loop sobre CAPABILITY_KEYS). Otros roles no
  // las reciben por defecto y quedan fuera de esta página.
  if (!hasCapability(perms, "banking_view")) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;
  const canManage = hasCapability(perms, "banking_manage");

  const bankAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId },
    include: { accountPlan: { select: { id: true, code: true, name: true } } },
    orderBy: { bankName: "asc" },
  });

  const accountPlans = await prisma.financeAccountPlan.findMany({
    where: { tenantId, isActive: true, acceptsEntries: true },
    select: { id: true, code: true, name: true, type: true },
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
      <PageHero
        icon={<Building2 />}
        iconTone="teal"
        title="Bancos"
        subtitle="cuentas y movimientos"
        description="Gestión de cuentas bancarias, movimientos e importación de cartolas."
      />
      <BancosClient
        accounts={data}
        accountPlans={accountPlans}
        canManage={canManage}
        cartolaInboxEmail={tenantInboxEmail(tenantId)}
      />
    </div>
  );
}
