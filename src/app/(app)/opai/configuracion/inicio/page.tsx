import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { LandingSurfaceConfigClient } from "@/components/configuracion/LandingSurfaceConfigClient";
import { LayoutDashboard } from "lucide-react";

export default async function ModoInicioConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/inicio");
  }

  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "config")) {
    redirect("/hub");
  }

  return (
    <ConfigPageLayout
      title="Modo de inicio"
      description="Elige si al entrar abres ERP o Productividad"
      icon={<LayoutDashboard className="h-[18px] w-[18px]" />}
    >
      <LandingSurfaceConfigClient />
    </ConfigPageLayout>
  );
}
