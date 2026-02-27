import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { OpsConfigTabs } from "@/components/ops/OpsConfigTabs";

export default async function OpsConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Operaciones"
        description="Configuración de marcaciones, rondas, emails automáticos y parámetros operativos"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <OpsConfigTabs />
    </div>
  );
}
