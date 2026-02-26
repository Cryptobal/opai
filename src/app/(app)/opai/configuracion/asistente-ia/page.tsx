import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { AiHelpChatConfigClient } from "@/components/opai/AiHelpChatConfigClient";

export default async function AsistenteIaConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Asistente IA"
        description="Configura acceso por roles y alcance del chat conversacional en la aplicación"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <AiHelpChatConfigClient />
    </div>
  );
}
