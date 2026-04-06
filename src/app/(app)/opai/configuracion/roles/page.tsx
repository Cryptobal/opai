import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { RoleTemplatesClient } from "@/components/opai/RoleTemplatesClient";
import { ShieldCheck } from "lucide-react";

export default async function RolesConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;

  // Solo owner/admin pueden gestionar roles
  if (role !== "owner" && role !== "admin") {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Roles y Permisos"
      description="Configura permisos por módulo y submódulo para cada rol"
      icon={<ShieldCheck className="h-[18px] w-[18px]" />}
    >
      <RoleTemplatesClient isOwner={role === "owner"} />
    </ConfigPageLayout>
  );
}
