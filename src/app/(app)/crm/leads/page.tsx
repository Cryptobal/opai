/**
 * CRM Leads Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAppAccess } from "@/lib/app-access";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmLeadsClient, CrmSubnav } from "@/components/crm";

export default async function CrmLeadsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/leads");
  }

  if (!hasAppAccess(session.user.role, "crm")) {
    redirect("/hub");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const leads = await prisma.crmLead.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  const initialLeads = JSON.parse(JSON.stringify(leads));

  return (
    <>
      <PageHeader
        title="Prospectos"
        description="Solicitudes entrantes y aprobación manual"
        className="mb-6"
      />
      <CrmSubnav />
      <CrmLeadsClient initialLeads={initialLeads} />
    </>
  );
}
