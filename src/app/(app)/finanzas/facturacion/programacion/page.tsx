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
import { BorradoresTab } from "@/components/finance/BorradoresTab";
import { DraftsMobileList } from "@/components/finance/programacion/DraftsMobileList";

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

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<CalendarDays />}
        iconTone="teal"
        title="Programación"
        description="Borradores pendientes de emitir al SII y plantillas recurrentes que generan DTEs automáticos."
      />
      <FinanceN3Chips submoduleKey="finance-compras-ventas" />

      <section>
        <h2 className="text-lg font-medium text-ds-text-1 mb-3">
          Borradores pendientes
        </h2>
        <DraftsMobileList
          canIssue={hasFacturacionCapability(perms, "facturacion_issue")}
          canManage={canManage}
        />
      </section>

      <section>
        <BorradoresTab canManage={canManage} />
      </section>
    </div>
  );
}
