import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { RoleTemplatesClient } from "@/components/opai/RoleTemplatesClient";
import { resolvePermissions } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";

export default async function RolesConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;

  // Solo owner/admin pueden gestionar roles
  if (role !== "owner" && role !== "admin") {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Gestión de Roles"
        description="Configura permisos por módulo y submódulo para cada rol"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <RoleTemplatesClient isOwner={role === "owner"} />
    </div>
  );
}
