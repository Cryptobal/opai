import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { Wallet } from "lucide-react";
import { getOrCreateCashflowConfig } from "@/modules/finance/cashflow/config.service";
import { listCategories } from "@/modules/finance/cashflow/category.service";
import { CashflowConfigClient } from "@/components/finance/cashflow/CashflowConfigClient";

export default async function CashflowConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/finanzas/flujo-caja");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_configure")) {
    redirect("/finanzas");
  }

  const tenantId = session.user.tenantId;
  const [config, categories] = await Promise.all([
    getOrCreateCashflowConfig(tenantId),
    listCategories(tenantId),
  ]);

  return (
    <ConfigPageLayout
      icon={<Wallet className="h-[18px] w-[18px]" />}
      title="Flujo de Caja"
      description="Horizontes de proyección, días de pago, generadores automáticos y categorías personalizadas."
    >
      <CashflowConfigClient
        initialConfig={JSON.parse(JSON.stringify(config))}
        initialCategories={JSON.parse(JSON.stringify(categories))}
      />
    </ConfigPageLayout>
  );
}
