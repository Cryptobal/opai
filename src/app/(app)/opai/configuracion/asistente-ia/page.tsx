import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { AiHelpChatConfigClient } from "@/components/opai/AiHelpChatConfigClient";
import { Bot } from "lucide-react";

export default async function AsistenteIaConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Asistente IA"
      description="Configura acceso por roles y alcance del chat conversacional en la aplicación"
      icon={<Bot className="h-[18px] w-[18px]" />}
    >
      <AiHelpChatConfigClient />
    </ConfigPageLayout>
  );
}
