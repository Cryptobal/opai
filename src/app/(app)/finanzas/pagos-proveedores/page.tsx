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
import { PagosProveedoresClient } from "@/components/finance/PagosProveedoresClient";

export default async function PagosProveedoresPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/pagos-proveedores");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "pagos")) redirect("/finanzas");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canManage = hasCapability(perms, "rendicion_configure");

  const bankAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, bankName: true, accountNumber: true },
    orderBy: { bankName: "asc" },
  });

  const suppliers = await prisma.financeSupplier.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, rut: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos a Proveedores"
        description="Registro y gestion de pagos a proveedores con asignacion a documentos."
      />
      <PagosProveedoresClient
        bankAccounts={bankAccounts}
        suppliers={suppliers}
        canManage={canManage}
      />
    </div>
  );
}
