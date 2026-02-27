import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmConfigTabs } from "@/components/crm/CrmConfigTabs";
import { FollowUpConfigSection } from "@/components/crm/FollowUpConfigSection";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function CrmConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/crm");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "crm")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const [stages, fields] = await Promise.all([
    prisma.crmPipelineStage.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
    }),
    prisma.crmCustomField.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Configuración CRM"
        description="Pipeline, campos y automatizaciones"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <CrmConfigTabs
        initialStages={stages}
        initialFields={fields}
        followUpSection={<FollowUpConfigSection />}
      />
    </div>
  );
}
