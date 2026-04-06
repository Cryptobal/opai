import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import GroupsConfigClient from "@/components/config/GroupsConfigClient";
import { Users } from "lucide-react";

export default async function GruposConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Grupos"
      description="Crea y administra grupos organizacionales (RRHH, Operaciones, etc.) para cadenas de aprobación y asignación de equipo"
      icon={<Users className="h-[18px] w-[18px]" />}
    >
      <GroupsConfigClient userRole={role} />
    </ConfigPageLayout>
  );
}
