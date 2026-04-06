import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { AiHelpChatConfigClient } from "@/components/opai/AiHelpChatConfigClient";
import { KnowledgeBaseManager } from "@/components/knowledge/KnowledgeBaseManager";
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
      description="Configura acceso por roles, alcance del chat conversacional y bases de conocimiento"
      icon={<Bot className="h-[18px] w-[18px]" />}
    >
      <div className="space-y-10">
        <AiHelpChatConfigClient />

        <div>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-foreground">Bases de conocimiento</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Los documentos que subas aquí solo estarán disponibles para usuarios de tu empresa.
              Además, tu chatbot tiene acceso a la documentación general de OPAI.
            </p>
          </div>
          <KnowledgeBaseManager />
        </div>
      </div>
    </ConfigPageLayout>
  );
}
