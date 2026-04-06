import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { OpsConfigTabs } from "@/components/ops/OpsConfigTabs";
import { ClipboardList } from "lucide-react";

export default async function OpsConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
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
