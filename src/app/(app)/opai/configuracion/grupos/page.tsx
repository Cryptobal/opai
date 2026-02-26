import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import GroupsConfigClient from "@/components/config/GroupsConfigClient";

export default async function GruposConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Grupos de Usuarios"
        description="Crea y administra grupos organizacionales (RRHH, Operaciones, etc.) para cadenas de aprobación y asignación de equipo"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <GroupsConfigClient userRole={role} />
    </div>
  );
}
