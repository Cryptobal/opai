/**
 * CRM Deal Detail Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { getUfValue } from "@/lib/uf";
import { resolveDealActiveQuotationSummary } from "@/lib/crm-deal-active-quotation";
import { CrmDealDetailClient, type DealDetail } from "@/components/crm";

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
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "deals")) redirect("/crm");
  const canConfigureCrm = canView(perms, "config", "crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const deal = await prisma.crmDeal.findFirst({
    where: { id, tenantId },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          isActive: true,
        },
      },
      stage: true,
      primaryContact: true,
      quotes: true,
    },
  });

  if (!deal) {
    redirect("/crm/deals");
  }

  const [
    quotes,
    pipelineStages,
    gmailAccount,
    docTemplatesMail,
    docTemplatesWhatsApp,
    dealContacts,
    accountContacts,
    accountInstallations,
    followUpConfig,
    followUpLogsRaw,
    ufValue,
  ] = await Promise.all([
    prisma.cpqQuote.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        clientName: true,
        status: true,
        monthlyCost: true,
        currency: true,
        totalGuards: true,
        createdAt: true,
        updatedAt: true,
        parameters: {
          select: {
            salePriceMonthly: true,
          },
        },
      },
    }),
    prisma.crmPipelineStage.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
    }),
    prisma.crmEmailAccount.findFirst({
      where: {
        tenantId,
        userId: session.user.id,
        provider: "gmail",
        status: "active",
      },
    }),
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
    prisma.crmDealContact.findMany({
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
    }),
    prisma.crmContact.findMany({
      where: { tenantId, accountId: deal.accountId },
      orderBy: { createdAt: "desc" },
    }),
    deal.accountId
      ? prisma.crmInstallation.findMany({
          where: { tenantId, accountId: deal.accountId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            commune: true,
            isActive: true,
          },
        })
      : Promise.resolve([]),
    prisma.crmFollowUpConfig.findUnique({
      where: { tenantId },
      select: {
        isActive: true,
        firstFollowUpDays: true,
        secondFollowUpDays: true,
        thirdFollowUpDays: true,
        sendHour: true,
        autoAdvanceStage: true,
        pauseOnReply: true,
      },
    }),
    prisma.crmFollowUpLog.findMany({
      where: { tenantId, dealId: id },
      orderBy: [{ sequence: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        sequence: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        error: true,
        createdAt: true,
      },
    }),
    getUfValue(),
  ]);

  const followUpLogIds = followUpLogsRaw.map((log: { id: string }) => log.id);
  const followUpMessages = followUpLogIds.length > 0
    ? await prisma.crmEmailMessage.findMany({
        where: {
          tenantId,
          followUpLogId: { in: followUpLogIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          followUpLogId: true,
          subject: true,
          toEmails: true,
          status: true,
          sentAt: true,
          deliveredAt: true,
          openCount: true,
          clickCount: true,
          bouncedAt: true,
        },
      })
    : [];

  const messageByFollowUpLogId = new Map<
    string,
    {
      id: string;
      subject: string;
      toEmails: string[];
      status: string;
      sentAt: Date | null;
      deliveredAt: Date | null;
      openCount: number;
      clickCount: number;
      bouncedAt: Date | null;
    }
  >();
  for (const message of followUpMessages) {
    if (!message.followUpLogId) continue;
    if (!messageByFollowUpLogId.has(message.followUpLogId)) {
      messageByFollowUpLogId.set(message.followUpLogId, message);
    }
  }

  const followUpLogs = followUpLogsRaw.map((log: {
    id: string;
    sequence: number;
    status: string;
    scheduledAt: Date;
    sentAt: Date | null;
    error: string | null;
    createdAt: Date;
  }) => {
    const emailMessage = messageByFollowUpLogId.get(log.id) ?? null;
    return {
      id: log.id,
      sequence: log.sequence,
      status: log.status,
      scheduledAt: log.scheduledAt,
      sentAt: log.sentAt,
      error: log.error,
      createdAt: log.createdAt,
      emailMessage,
    };
  });

  const linkedQuoteIds = new Set((deal.quotes ?? []).map((quote) => quote.quoteId));
  const linkedQuotes = quotes.filter((quote) => linkedQuoteIds.has(quote.id));
  const linkedQuoteById = new Map(linkedQuotes.map((quote) => [quote.id, quote]));
  const activeQuoteSummary = resolveDealActiveQuotationSummary(
    deal,
    linkedQuoteById,
    ufValue
  );

  const initialDeal = JSON.parse(JSON.stringify(deal)) as DealDetail;
  initialDeal.proposalLink = deal.proposalLink ?? null;
  initialDeal.proposalSentAt = deal.proposalSentAt ? deal.proposalSentAt.toISOString() : null;
  initialDeal.status = deal.status;
  initialDeal.activeQuotationId = deal.activeQuotationId ?? null;
  initialDeal.activeQuoteSummary = activeQuoteSummary
    ? JSON.parse(JSON.stringify(activeQuoteSummary))
    : null;
  const initialQuotes = JSON.parse(JSON.stringify(quotes));
  const initialPipelineStages = JSON.parse(JSON.stringify(pipelineStages));
  const initialDealContacts = JSON.parse(JSON.stringify(dealContacts));
  const initialAccountContacts = JSON.parse(JSON.stringify(accountContacts));
  const initialAccountInstallations = JSON.parse(JSON.stringify(accountInstallations));
  const initialDocTemplatesMail = JSON.parse(JSON.stringify(docTemplatesMail));
  const initialDocTemplatesWhatsApp = JSON.parse(JSON.stringify(docTemplatesWhatsApp));
  const initialFollowUpConfig = followUpConfig ? JSON.parse(JSON.stringify(followUpConfig)) : null;
  const initialFollowUpLogs = JSON.parse(JSON.stringify(followUpLogs));

  return (
    <>
      <div className="space-y-4">
        <CrmDealDetailClient
          deal={initialDeal}
          quotes={initialQuotes}
          pipelineStages={initialPipelineStages}
          dealContacts={initialDealContacts}
          accountContacts={initialAccountContacts}
          accountInstallations={initialAccountInstallations}
          gmailConnected={Boolean(gmailAccount)}
          docTemplatesMail={initialDocTemplatesMail}
          docTemplatesWhatsApp={initialDocTemplatesWhatsApp}
          followUpConfig={initialFollowUpConfig}
          followUpLogs={initialFollowUpLogs}
          ufValue={ufValue}
          canConfigureCrm={canConfigureCrm}
          currentUserId={session.user.id}
        />
      </div>
    </>
  );
}
