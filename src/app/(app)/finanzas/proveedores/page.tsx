import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  canEdit,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero, ModuleSubNav } from "@/components/opai-ds";
import { Truck } from "lucide-react";
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
  // Proveedores es parte de Compras y Ventas — info sensible. Solo
  // owner/admin (purchases_view) o roles con permiso explícito de submodule.
  if (
    !hasCapability(perms, "purchases_view") &&
    !canView(perms, "finance", "proveedores")
  ) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;
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
      <PageHero
        icon={<Truck />}
        iconTone="teal"
        title="Proveedores"
        subtitle="ficha y condiciones"
        description="Gestión de proveedores y sus datos bancarios."
      />
      <ModuleSubNav moduleKey="finance-compras-ventas" visibility="always" />
      <ProveedoresClient
        suppliers={data}
        accounts={accounts}
        canManage={canManage}
      />
    </div>
  );
}
