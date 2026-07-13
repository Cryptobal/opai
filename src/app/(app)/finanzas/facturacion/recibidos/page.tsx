import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";
import { Button } from "@/components/ui/button";
import { FileInput, Plus } from "lucide-react";
import { FacturacionClient } from "@/components/finance/FacturacionClient";

export default async function DtesRecibidosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/recibidos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (
    !hasCapability(perms, "purchases_view") &&
    !hasFacturacionCapability(perms, "facturacion_view")
  ) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;
  // Registrar, editar, acusar y vincular centros de costo en DTEs recibidos
  // comparten la capability granular que usan sus APIs.
  const canManage = hasFacturacionCapability(perms, "facturacion_create_draft");

  const suppliers = await prisma.financeSupplier.findMany({
    where: { tenantId },
    select: { id: true, rut: true, name: true },
    orderBy: { name: "asc" },
  });

  const initialKpis = {
    ventasMes: 0,
    ivaDebitoMes: 0,
    pendientesSii: 0,
    facturasMes: 0,
    foliosDisponibles: 0,
    foliosLowCount: 0,
    comparison: { vs: "vs mes anterior", pct: 0 },
    periodLabel: "",
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<FileInput />}
        iconTone="teal"
        title="DTEs Recibidos"
        description="Documentos tributarios recibidos de proveedores."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link href="/finanzas/facturacion/recibidos?registrar=1">
                <Plus className="h-4 w-4 mr-1.5" />
                Registrar DTE
              </Link>
            </Button>
          ) : undefined
        }
      />
      <FinanceN3Chips submoduleKey="finance-compras-ventas" />
      <FacturacionClient
        dtes={[]}
        issuedTotal={0}
        canManage={canManage}
        suppliers={suppliers}
        initialKpis={initialKpis}
        view="recibidos"
      />
    </div>
  );
}
