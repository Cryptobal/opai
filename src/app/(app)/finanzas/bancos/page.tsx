import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { BancosClient } from "@/components/finance/BancosClient";
import { tenantInboxEmail } from "@/modules/finance/banking/cartola-inbox";

export default async function BancosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; txId?: string }>;
}) {
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

  // "Cuentas y cartolas" (N3 de Banca) aterriza acá y muestra las cuentas
  // bancarias y sus movimientos. Antes redirigía a Flujo de Caja (landing
  // histórica), pero con la planilla como su propia entrada de nav ese
  // redirect dejaba "Cuentas" inservible (bounce a una página lenta). El
  // deep-link `?tab=`/`?txId=` sigue funcionando como antes.
  const sp = await searchParams;

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
    <div className="min-w-0">
      <BancosClient
        accounts={data}
        accountPlans={accountPlans}
        canManage={canManage}
        cartolaInboxEmail={tenantInboxEmail(tenantId)}
      />
    </div>
  );
}
