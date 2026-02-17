/**
 * CRM Deals Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmDealsClient } from "@/components/crm";
import { CrmGlobalSearch } from "@/components/crm/CrmGlobalSearch";

type DealsFocus =
  | "all"
  | "proposals-sent-30d"
  | "won-after-proposal-30d"
  | "followup-open"
  | "followup-overdue";

function normalizeDealsFocus(value?: string): DealsFocus {
  if (value === "proposals-sent-30d") return value;
  if (value === "won-after-proposal-30d") return value;
  if (value === "followup-open") return value;
  if (value === "followup-overdue") return value;
  return "all";
}

function getDealsFocusText(focus: DealsFocus): string | null {
  if (focus === "proposals-sent-30d") return "Filtro activo: propuestas enviadas (últimos 30 días)";
  if (focus === "won-after-proposal-30d") return "Filtro activo: negocios ganados tras propuesta (últimos 30 días)";
  if (focus === "followup-open") return "Filtro activo: negocios abiertos en seguimiento";
  if (focus === "followup-overdue") return "Filtro activo: negocios con seguimientos vencidos";
  return null;
}

export default async function CrmDealsPage({
  searchParams,
}: {
  searchParams?: Promise<{ focus?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const focus = normalizeDealsFocus(resolvedSearchParams?.focus);

  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/deals");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "deals")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const includeRelations = {
    stage: true,
    primaryContact: true,
    quotes: true,
    followUpLogs: {
      where: { status: "pending" },
      orderBy: { scheduledAt: "asc" },
      take: 1,
      select: {
        id: true,
        sequence: true,
        status: true,
        scheduledAt: true,
      },
    },
  } as const;

  let deals;
  if (focus === "proposals-sent-30d") {
    deals = await prisma.crmDeal.findMany({
      where: {
        tenantId,
        proposalSentAt: { gte: thirtyDaysAgo },
      },
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
  } else if (focus === "followup-open") {
    deals = await prisma.crmDeal.findMany({
      where: {
        tenantId,
        status: "open",
        proposalSentAt: { not: null },
      },
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
  } else if (focus === "followup-overdue") {
    deals = await prisma.crmDeal.findMany({
      where: {
        tenantId,
        status: "open",
        followUpLogs: {
          some: {
            status: "pending",
            scheduledAt: { lte: now },
          },
        },
      },
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
  } else if (focus === "won-after-proposal-30d") {
    const wonStageIds = await prisma.crmPipelineStage.findMany({
      where: { tenantId, isClosedWon: true },
      select: { id: true },
    });

    deals = await prisma.crmDeal.findMany({
      where: {
        tenantId,
        status: "won",
        proposalSentAt: { not: null },
        stageHistory: {
          some: {
            toStageId: { in: wonStageIds.map((stage: { id: string }) => stage.id) },
            changedAt: { gte: thirtyDaysAgo },
          },
        },
      },
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
  } else {
    deals = await prisma.crmDeal.findMany({
      where: { tenantId },
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
  }

  const [accounts, stages, quotes] = await Promise.all([
    prisma.crmAccount.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
      },
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

  const accountById = new Map(
    accounts.map((account: { id: string; name: string; type: string; status: string }) => [account.id, account])
  );
  const dealsWithAccount = deals.map((deal: { accountId: string | null }) => ({
    ...deal,
    account: deal.accountId ? accountById.get(deal.accountId) ?? null : null,
  }));

  const initialDeals = JSON.parse(JSON.stringify(dealsWithAccount));
  const initialAccounts = JSON.parse(JSON.stringify(accounts));
  const initialStages = JSON.parse(JSON.stringify(stages));
  const initialQuotes = JSON.parse(JSON.stringify(quotes));

  return (
    <>
      <PageHeader
        title="Negocios"
        description={getDealsFocusText(focus) ?? "Pipeline comercial y oportunidades"}
      />
      <CrmGlobalSearch className="w-full sm:max-w-xs" />
      <CrmDealsClient
        initialDeals={initialDeals}
        accounts={initialAccounts}
        stages={initialStages}
        quotes={initialQuotes}
        initialFocus={focus}
      />
    </>
  );
}
