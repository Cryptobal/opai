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
import { FileMinus } from "lucide-react";
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
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/rendiciones");
  }
  if (!hasFacturacionCapability(perms, "facturacion_credit_note")) {
    redirect("/finanzas/facturacion");
  }

  const tenantId = session.user.tenantId;
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
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<FileMinus />}
        iconTone="teal"
        title="Emitir Nota de Crédito"
        subtitle="ajuste a la baja"
        description="Emitir nota de crédito electrónica referenciando un DTE."
      />
      <FinanceN3Chips submoduleKey="finance-compras-ventas" />
      <CreditNoteForm
        noteType="credit"
        referenceDte={referenceDte}
      />
    </div>
  );
}
