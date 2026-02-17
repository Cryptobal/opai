import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { OpsConfigClient } from "@/components/ops/OpsConfigClient";

export default async function OpsConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operaciones"
        description="Configuración de marcaciones, rondas, emails automáticos y parámetros operativos"
      />
      <OpsConfigClient />
    </div>
  );
}
