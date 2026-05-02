import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { KnowledgeConfigClient } from "@/components/configuracion/KnowledgeConfigClient";
import { getKnowledgeConfig } from "@/lib/knowledge/config";

export default async function ConocimientoConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/conocimiento");
  }

  const perms = await resolvePermissions({
    role: session.user.role,
    roleTemplateId: session.user.roleTemplateId,
  });
  if (!canView(perms, "config", "conocimiento")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/opai/login");
  }

  const initialConfig = await getKnowledgeConfig(tenantId);

  return (
    <ConfigPageLayout
      title="Conocimiento"
      description="Frecuencia de exámenes recurrentes para guardias, recordatorios y deadlines (Ley 21.719)"
      icon={<GraduationCap className="h-[18px] w-[18px]" />}
    >
      <KnowledgeConfigClient initial={initialConfig} />
    </ConfigPageLayout>
  );
}
