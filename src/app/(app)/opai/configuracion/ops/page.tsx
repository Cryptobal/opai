import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { OpsConfigTabs } from "@/components/ops/OpsConfigTabs";
import { ClipboardList } from "lucide-react";

export default async function OpsConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion/ops");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "ops")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Operaciones"
      description="Configuración de marcaciones, rondas, emails automáticos y parámetros operativos"
      icon={<ClipboardList className="h-[18px] w-[18px]" />}
    >
      <OpsConfigTabs />
    </ConfigPageLayout>
  );
}
