import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { ConfigSubnav } from "@/components/opai";
import { CrmConfigClient } from "@/components/crm/CrmConfigClient";

export default async function CrmConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/crm");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/hub");
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
      <PageHeader
        title="Configuración CRM"
        description="Pipeline, campos y automatizaciones"
        className="mb-6"
      />
      <ConfigSubnav />
      <CrmConfigClient initialStages={stages} initialFields={fields} />
    </>
  );
}
