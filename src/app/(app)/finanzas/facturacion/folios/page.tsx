import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { PageHero, ModuleSubNav } from "@/components/opai-ds";
import { FileText } from "lucide-react";
import { FacturacionClient } from "@/components/finance/FacturacionClient";

export default async function FoliosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/folios");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/rendiciones");
  }

  const canManage =
    hasFacturacionCapability(perms, "facturacion_issue") ||
    hasFacturacionCapability(perms, "facturacion_credit_note") ||
    hasFacturacionCapability(perms, "facturacion_void") ||
    hasFacturacionCapability(perms, "facturacion_resend_email") ||
    hasFacturacionCapability(perms, "facturacion_configure");

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
        icon={<FileText />}
        iconTone="teal"
        title="Folios"
        description="Stock disponible de folios CAF por tipo de DTE."
      />
      <ModuleSubNav moduleKey="finance-compras-ventas" visibility="always" />
      <FacturacionClient
        dtes={[]}
        issuedTotal={0}
        canManage={canManage}
        initialKpis={initialKpis}
        view="folios"
      />
    </div>
  );
}
