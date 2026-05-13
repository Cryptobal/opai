import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";
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
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/rendiciones");
  }
  // La página de emisión es accesible para quienes pueden emitir DTEs O crear
  // borradores (asistentes contables que preparan el DTE para que un gerente
  // lo emita). Si quisieras restringir a solo emisores reales, dejá únicamente
  // `facturacion_issue`.
  if (
    !hasFacturacionCapability(perms, "facturacion_issue") &&
    !hasFacturacionCapability(perms, "facturacion_create_draft")
  ) {
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
        title="Emitir DTE"
        subtitle="factura, boleta o guía"
        description="Emisión de factura electrónica o factura exenta."
      />
      <FinanceN3Chips submoduleKey="finance-compras-ventas" />
      <DteForm
        availableTypes={availableTypes}
        accounts={accounts}
      />
    </div>
  );
}
