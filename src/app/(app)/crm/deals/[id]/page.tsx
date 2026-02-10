/**
 * CRM Deal Detail Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasCrmSubmoduleAccess } from "@/lib/module-access";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader, Breadcrumb } from "@/components/opai";
import { CrmDealDetailClient, type DealDetail, CrmSubnav } from "@/components/crm";

export default async function CrmDealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/deals/${id}`);
  }
  const role = session.user.role;

  if (!hasCrmSubmoduleAccess(role, "deals")) {
    redirect("/crm");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const deal = await prisma.crmDeal.findFirst({
    where: { id, tenantId },
    include: {
      account: true,
      stage: true,
      primaryContact: true,
      quotes: true,
    },
  });

  if (!deal) {
    redirect("/crm/deals");
  }

  const quotes = await prisma.cpqQuote.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, clientName: true, status: true },
  });

  const pipelineStages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true },
    orderBy: { order: "asc" },
  });

  const gmailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
  });

  const [docTemplatesMail, docTemplatesWhatsApp] = await Promise.all([
    prisma.docTemplate.findMany({
      where: { tenantId, module: "mail", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, content: true },
    }),
    prisma.docTemplate.findMany({
      where: { tenantId, module: "whatsapp", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, content: true },
    }),
  ]);

  // Contacts linked to this deal (via deal_contacts)
  const dealContacts = await prisma.crmDealContact.findMany({
    where: { dealId: id, tenantId },
    include: {
      contact: {
        select: {
          id: true, firstName: true, lastName: true,
          email: true, phone: true, roleTitle: true, isPrimary: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // All contacts from the account (for the "add" selector)
  const accountContacts = await prisma.crmContact.findMany({
    where: { tenantId, accountId: deal.accountId },
    orderBy: { createdAt: "desc" },
  });

  const initialDeal = JSON.parse(JSON.stringify(deal)) as DealDetail;
  initialDeal.proposalLink = deal.proposalLink ?? null;
  const initialQuotes = JSON.parse(JSON.stringify(quotes));
  const initialPipelineStages = JSON.parse(JSON.stringify(pipelineStages));
  const initialDealContacts = JSON.parse(JSON.stringify(dealContacts));
  const initialAccountContacts = JSON.parse(JSON.stringify(accountContacts));
  const initialDocTemplatesMail = JSON.parse(JSON.stringify(docTemplatesMail));
  const initialDocTemplatesWhatsApp = JSON.parse(JSON.stringify(docTemplatesWhatsApp));

  return (
    <>
      <Breadcrumb
        items={[
          { label: "CRM", href: "/crm" },
          { label: "Negocios", href: "/crm/deals" },
          { label: deal.title },
        ]}
        className="mb-4"
      />
      <PageHeader
        title={deal.title}
        description={`${deal.account?.name || "Sin cliente"} · ${deal.stage?.name || "Sin etapa"}`}
      />
      <CrmSubnav role={role} />
      <div className="space-y-4">
        <CrmDealDetailClient
          deal={initialDeal}
          quotes={initialQuotes}
          pipelineStages={initialPipelineStages}
          dealContacts={initialDealContacts}
          accountContacts={initialAccountContacts}
          gmailConnected={Boolean(gmailAccount)}
          docTemplatesMail={initialDocTemplatesMail}
          docTemplatesWhatsApp={initialDocTemplatesWhatsApp}
        />
      </div>
    </>
  );
}
