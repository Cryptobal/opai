import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { CrmConfigTabs } from "@/components/crm/CrmConfigTabs";
import { FollowUpConfigSection } from "@/components/crm/FollowUpConfigSection";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { TrendingUp } from "lucide-react";

export default async function CrmConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/crm");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "crm")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId;
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { slug: true },
  });
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
    <ConfigPageLayout
      title="CRM"
      description="Pipeline, campos y automatizaciones"
      icon={<TrendingUp className="h-[18px] w-[18px]" />}
    >
      <CrmConfigTabs
        initialStages={stages}
        initialFields={fields}
        followUpSection={<FollowUpConfigSection />}
        tenantSlug={tenant.slug}
      />
    </ConfigPageLayout>
  );
}
