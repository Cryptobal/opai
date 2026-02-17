import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { DteForm } from "@/components/finance/DteForm";

export default async function EmitirDtePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/emitir");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!hasCapability(perms, "facturacion_manage")) {
    redirect("/finanzas/facturacion");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const accounts = await prisma.financeAccountPlan.findMany({
    where: { tenantId, isActive: true, acceptsEntries: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  // Available DTE types for issuance (factura afecta + exenta)
  const availableTypes = [33, 34];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emitir DTE"
        description="Emisión de factura electrónica o factura exenta."
      />
      <DteForm
        availableTypes={availableTypes}
        accounts={accounts}
      />
    </div>
  );
}
