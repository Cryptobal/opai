/**
 * CRM Contact Detail Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { normalizeEmailAddress } from "@/lib/email-address";
import { CrmContactDetailClient } from "@/components/crm/CrmContactDetailClient";
import { NotesProvider } from "@/components/notes";

export default async function CrmContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/contacts/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "contacts")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());

  const contact = await prisma.crmContact.findFirst({
    where: { id, tenantId },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          type: true,
          industry: true,
        },
      },
    },
  });

  if (!contact) {
    redirect("/crm/contacts");
  }

  // Get deals from the contact's account
  const deals = contact.accountId
    ? await prisma.crmDeal.findMany({
        where: { tenantId, accountId: contact.accountId },
        include: { stage: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Get installations from the contact's account
  const installations = contact.accountId
    ? await prisma.crmInstallation.findMany({
        where: { tenantId, accountId: contact.accountId },
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
    : [];

  // Get quotes from the contact's account
  const quotes = contact.accountId
    ? await prisma.cpqQuote.findMany({
        where: { tenantId, accountId: contact.accountId },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          totalPositions: true,
          totalGuards: true,
          updatedAt: true,
        },
      })
    : [];

  // Gmail, pipeline stages, doc templates (mail + whatsapp)
  const [gmailAccount, pipelineStages, docTemplatesMail, docTemplatesWhatsApp] = await Promise.all([
    prisma.crmEmailAccount.findFirst({
      where: { tenantId, userId: session.user.id, provider: "gmail", status: "active" },
    }),
    prisma.crmPipelineStage.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
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
  ]);

  const linkedThreads = await prisma.crmEmailThread.findMany({
    where: { tenantId, contactId: contact.id },
    select: { id: true },
  });
  const threadIds = linkedThreads.map((thread: { id: string }) => thread.id);
  const rawContactEmail = contact.email?.trim() || "";
  const normalizedContactEmail = rawContactEmail
    ? normalizeEmailAddress(rawContactEmail)
    : "";
  const emailCandidates = Array.from(
    new Set([rawContactEmail, normalizedContactEmail].filter(Boolean))
  );

  const messageFilters: Array<Record<string, unknown>> = [];
  if (threadIds.length > 0) {
    messageFilters.push({ threadId: { in: threadIds } });
  }
  for (const email of emailCandidates) {
    messageFilters.push({
      fromEmail: { contains: email, mode: "insensitive" },
    });
    messageFilters.push({ toEmails: { has: email } });
    messageFilters.push({ ccEmails: { has: email } });
    messageFilters.push({ bccEmails: { has: email } });
  }

  const initialEmailCount =
    messageFilters.length > 0
      ? await prisma.crmEmailMessage.count({
          where: {
            tenantId,
            OR: messageFilters as any,
          },
        })
      : 0;

  const data = JSON.parse(JSON.stringify(contact));
  const initialDeals = JSON.parse(JSON.stringify(deals));
  const initialInstallations = JSON.parse(JSON.stringify(installations));
  const initialQuotes = JSON.parse(JSON.stringify(quotes));
  const initialPipelineStages = JSON.parse(JSON.stringify(pipelineStages));
  const initialDocTemplatesMail = JSON.parse(JSON.stringify(docTemplatesMail));
  const initialDocTemplatesWhatsApp = JSON.parse(JSON.stringify(docTemplatesWhatsApp));

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  return (
    <NotesProvider
      contextType="CONTACT"
      contextId={id}
      contextLabel={fullName || "Contacto"}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    >
      <CrmContactDetailClient
        contact={data}
        deals={initialDeals}
        installations={initialInstallations}
        quotes={initialQuotes}
        pipelineStages={initialPipelineStages}
        gmailConnected={!!gmailAccount}
        docTemplatesMail={initialDocTemplatesMail}
        docTemplatesWhatsApp={initialDocTemplatesWhatsApp}
        initialEmailCount={initialEmailCount}
        currentUserId={session.user.id}
      />
    </NotesProvider>
  );
}
