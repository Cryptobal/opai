/**
 * CRM Deals Page — pipeline rediseñado
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import {
  DEAL_LIST_BOARD_PAGE_SIZE_PER_STAGE,
  listCrmDeals,
  type DealsFocus,
} from "@/lib/crm/list-deals";
import { getDealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";
import { CrmDealsClient } from "@/components/crm";
import { triggerFollowUpProcessing } from "@/lib/followup-selfheal";

function normalizeDealsFocus(value?: string): DealsFocus {
  if (value === "proposals-sent-30d") return value;
  if (value === "won-after-proposal-30d") return value;
  if (value === "followup-open") return value;
  if (value === "followup-overdue") return value;
  return "all";
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
  const tenantId = session.user.tenantId;

  if (focus === "followup-overdue") {
    triggerFollowUpProcessing();
  }

  const stages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true },
    orderBy: { order: "asc" },
  });

  const openStages = stages.filter((s) => !s.isClosedWon && !s.isClosedLost);

  const [summary, ...stagePages] = await Promise.all([
    getDealsPipelineSummary({ tenantId, focus }),
    ...openStages.map((stage) =>
      listCrmDeals({
        tenantId,
        focus,
        stageId: stage.id,
        sort: "newest",
        page: 1,
        pageSize: DEAL_LIST_BOARD_PAGE_SIZE_PER_STAGE,
      }),
    ),
  ]);

  const initialByStage: Record<
    string,
    { deals: unknown[]; total: number; hasMore: boolean }
  > = {};
  openStages.forEach((stage, i) => {
    const page = stagePages[i];
    initialByStage[stage.id] = {
      deals: page.deals,
      total: page.total,
      hasMore: page.hasMore,
    };
  });

  return (
    <div className="min-w-0">
      <CrmDealsClient
        initialDeals={[]}
        accounts={[]}
        stages={JSON.parse(JSON.stringify(stages))}
        initialFocus={focus}
        initialSummary={JSON.parse(JSON.stringify(summary))}
        initialByStage={JSON.parse(JSON.stringify(initialByStage))}
      />
    </div>
  );
}
