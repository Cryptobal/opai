import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";
import { CalendarDays } from "lucide-react";
import { FacturacionClient } from "@/components/finance/FacturacionClient";
import { DraftsList } from "@/components/finance/programacion/DraftsList";

export default async function ProgramacionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/programacion");
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
        icon={<CalendarDays />}
        iconTone="teal"
        title="Programación"
        description="Borradores pendientes de emitir al SII y plantillas recurrentes que generan DTEs automáticos."
      />
      <FinanceN3Chips submoduleKey="finance-compras-ventas" />

      <div>
        <h2 className="text-lg font-medium text-ds-text-1 mb-3">
          Borradores pendientes
        </h2>
        <DraftsList
          canIssue={hasFacturacionCapability(perms, "facturacion_issue")}
        />
      </div>

      <FacturacionClient
        dtes={[]}
        issuedTotal={0}
        canManage={canManage}
        initialKpis={initialKpis}
        view="programacion"
      />
    </div>
  );
}
