/**
 * CRM Deals Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAppAccess } from "@/lib/app-access";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmDealsClient, CrmSubnav } from "@/components/crm";

export default async function CrmDealsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/deals");
  }

  if (!hasAppAccess(session.user.role, "crm")) {
    redirect("/hub");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());

  const [deals, accounts, stages, quotes] = await Promise.all([
    prisma.crmDeal.findMany({
      where: { tenantId },
      include: { account: true, stage: true, primaryContact: true, quotes: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.crmPipelineStage.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
    }),
    prisma.cpqQuote.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, clientName: true, status: true },
    }),
  ]);

  const initialDeals = JSON.parse(JSON.stringify(deals));
  const initialAccounts = JSON.parse(JSON.stringify(accounts));
  const initialStages = JSON.parse(JSON.stringify(stages));
  const initialQuotes = JSON.parse(JSON.stringify(quotes));

  return (
    <>
      <PageHeader
        title="Negocios"
        description="Pipeline comercial y oportunidades"
        className="mb-6"
      />
      <CrmSubnav />
      <CrmDealsClient
        initialDeals={initialDeals}
        accounts={initialAccounts}
        stages={initialStages}
        quotes={initialQuotes}
      />
    </>
  );
}
