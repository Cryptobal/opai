/**
 * CRM Deal Detail Page
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasAppAccess } from "@/lib/app-access";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmDealDetailClient } from "@/components/crm";

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

  if (!hasAppAccess(session.user.role, "crm")) {
    redirect("/hub");
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

  const gmailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
  });

  const templates = await prisma.crmEmailTemplate.findMany({
    where: {
      tenantId,
    },
    orderBy: { createdAt: "desc" },
  });

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, accountId: deal.accountId },
    orderBy: { createdAt: "desc" },
  });

  const initialDeal = JSON.parse(JSON.stringify(deal));
  const initialQuotes = JSON.parse(JSON.stringify(quotes));
  const initialContacts = JSON.parse(JSON.stringify(contacts));
  const initialTemplates = JSON.parse(JSON.stringify(templates));

  return (
    <>
      <PageHeader
        title={deal.title}
        description="Detalle del negocio y cotizaciones"
        className="mb-6"
      />
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/crm/deals" className="hover:text-foreground">
            Negocios
          </Link>
          <span>/</span>
          <span>{deal.title}</span>
        </div>

        <CrmDealDetailClient
          deal={initialDeal}
          quotes={initialQuotes}
          contacts={initialContacts}
          gmailConnected={Boolean(gmailAccount)}
          templates={initialTemplates}
        />
      </div>
    </>
  );
}
