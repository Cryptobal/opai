import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import GroupsConfigClient from "@/components/config/GroupsConfigClient";
import { Users } from "lucide-react";

export default async function GruposConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion/grupos");

  const role = session.user.role;
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "grupos")) {
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
