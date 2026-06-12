import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";
import { Send } from "lucide-react";
import { EmailHistoryClient } from "@/components/finance/envios/EmailHistoryClient";

export default async function EnviosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/envios");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/rendiciones");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Send />}
        iconTone="teal"
        title="Envíos"
        description="Histórico mensual de proformas, estados de pago y facturas enviadas por correo: destinatarios, asunto y estado de entrega."
      />
      <FinanceN3Chips submoduleKey="finance-compras-ventas" />
      <EmailHistoryClient />
    </div>
  );
}
