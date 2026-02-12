/**
 * CRM Deal Detail Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasConfigSubmoduleAccess, hasCrmSubmoduleAccess } from "@/lib/module-access";
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
  const canConfigureCrm = hasConfigSubmoduleAccess(role, "crm");

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
    followUpConfig,
    followUpLogsRaw,
  ] = await Promise.all([
    prisma.cpqQuote.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, clientName: true, status: true },
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
    prisma.crmFollowUpConfig.findUnique({
      where: { tenantId },
      select: {
        isActive: true,
        firstFollowUpDays: true,
        secondFollowUpDays: true,
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

  const initialDeal = JSON.parse(JSON.stringify(deal)) as DealDetail;
  initialDeal.proposalLink = deal.proposalLink ?? null;
  initialDeal.proposalSentAt = deal.proposalSentAt ? deal.proposalSentAt.toISOString() : null;
  initialDeal.status = deal.status;
  const initialQuotes = JSON.parse(JSON.stringify(quotes));
  const initialPipelineStages = JSON.parse(JSON.stringify(pipelineStages));
  const initialDealContacts = JSON.parse(JSON.stringify(dealContacts));
  const initialAccountContacts = JSON.parse(JSON.stringify(accountContacts));
  const initialDocTemplatesMail = JSON.parse(JSON.stringify(docTemplatesMail));
  const initialDocTemplatesWhatsApp = JSON.parse(JSON.stringify(docTemplatesWhatsApp));
  const initialFollowUpConfig = followUpConfig ? JSON.parse(JSON.stringify(followUpConfig)) : null;
  const initialFollowUpLogs = JSON.parse(JSON.stringify(followUpLogs));

  return (
    <>
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
          followUpConfig={initialFollowUpConfig}
          followUpLogs={initialFollowUpLogs}
          canConfigureCrm={canConfigureCrm}
          currentUserId={session.user.id}
        />
      </div>
    </>
  );
}
