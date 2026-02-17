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
import { CreditNoteForm } from "@/components/finance/CreditNoteForm";

interface PageProps {
  searchParams: Promise<{ referenceDteId?: string }>;
}

export default async function NotaCreditoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/notas/credito");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "facturacion")) redirect("/finanzas/rendiciones");
  if (!hasCapability(perms, "facturacion_manage")) {
    redirect("/finanzas/facturacion");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const params = await searchParams;
  const referenceDteId = params.referenceDteId;

  let referenceDte = null;
  if (referenceDteId) {
    const dte = await prisma.financeDte.findFirst({
      where: { id: referenceDteId, tenantId },
      include: { lines: true },
    });
    if (dte) {
      referenceDte = {
        id: dte.id,
        dteType: dte.dteType,
        folio: dte.folio,
        receiverRut: dte.receiverRut,
        receiverName: dte.receiverName,
        totalAmount: dte.totalAmount.toNumber(),
        lines: dte.lines.map((l) => ({
          itemName: l.itemName,
          description: l.description,
          quantity: l.quantity.toNumber(),
          unitPrice: l.unitPrice.toNumber(),
        })),
      };
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emitir Nota de Crédito"
        description="Emitir nota de crédito electrónica referenciando un DTE."
      />
      <CreditNoteForm
        noteType="credit"
        referenceDte={referenceDte}
      />
    </div>
  );
}
