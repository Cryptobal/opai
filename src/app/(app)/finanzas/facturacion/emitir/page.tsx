import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { FileText } from "lucide-react";
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
  if (!canView(perms, "finance", "facturacion")) redirect("/finanzas/rendiciones");
  if (!hasCapability(perms, "facturacion_manage")) {
    redirect("/finanzas/facturacion");
  }

  const tenantId = session.user.tenantId;

  const accounts = await prisma.financeAccountPlan.findMany({
    where: { tenantId, isActive: true, acceptsEntries: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  // Available DTE types for issuance (factura afecta + exenta)
  const availableTypes = [33, 34];

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<FileText />}
        iconTone="teal"
        eyebrow={["Finanzas", "Facturación", "Emitir"]}
        title="Emitir DTE"
        subtitle="factura, boleta o guía"
        description="Emisión de factura electrónica o factura exenta."
      />
      <DteForm
        availableTypes={availableTypes}
        accounts={accounts}
      />
    </div>
  );
}
