import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  canEdit,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { ProveedoresClient } from "@/components/finance/ProveedoresClient";

export default async function ProveedoresPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/proveedores");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "proveedores")) redirect("/finanzas/rendiciones");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canManage = canEdit(perms, "finance", "proveedores");

  const suppliers = await prisma.financeSupplier.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    take: 500,
  });

  // Fetch accounts for the form selects (payable + expense accounts)
  const accounts = await prisma.financeAccountPlan.findMany({
    where: { tenantId, isActive: true, acceptsEntries: true },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });

  const data = suppliers.map((s) => ({
    id: s.id,
    rut: s.rut,
    name: s.name,
    tradeName: s.tradeName,
    address: s.address,
    commune: s.commune,
    city: s.city,
    email: s.email,
    phone: s.phone,
    contactName: s.contactName,
    paymentTermDays: s.paymentTermDays,
    accountPayableId: s.accountPayableId,
    accountExpenseId: s.accountExpenseId,
    isActive: s.isActive,
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Proveedores"
        description="Gestión de proveedores y sus datos bancarios."
      />
      <ProveedoresClient
        suppliers={data}
        accounts={accounts}
        canManage={canManage}
      />
    </div>
  );
}
