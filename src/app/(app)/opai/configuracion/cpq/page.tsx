import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { CpqConfigTabs } from "@/components/cpq/CpqConfigTabs";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DollarSign } from "lucide-react";

export default async function CpqConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/cpq");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "cpq")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Cotizaciones (CPQ)"
      description="Catálogo, puestos, cargos, roles y parámetros de pricing"
      icon={DollarSign}
    >
      <CpqConfigTabs />
    </ConfigPageLayout>
  );
}
