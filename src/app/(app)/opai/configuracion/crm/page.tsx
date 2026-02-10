import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { ConfigBackLink } from "@/components/opai";
import { CrmConfigClient } from "@/components/crm/CrmConfigClient";
import { FollowUpConfigSection } from "@/components/crm/FollowUpConfigSection";
import { hasConfigSubmoduleAccess } from "@/lib/module-access";

export default async function CrmConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/crm");
  }

  const role = session.user.role;
  if (!hasConfigSubmoduleAccess(role, "crm")) {
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
    <>
      <ConfigBackLink />
      <PageHeader
        title="Configuración CRM"
        description="Pipeline, campos y automatizaciones"
      />
      <CrmConfigClient initialStages={stages} initialFields={fields} />
      <FollowUpConfigSection />
    </>
  );
}
