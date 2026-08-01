/**
 * CRM Deals Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import {
  DEAL_LIST_KANBAN_PAGE_SIZE,
  listCrmDeals,
  type DealsFocus,
} from "@/lib/crm/list-deals";
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

  // SSR: primera página tamaño kanban (vista default) + stages.
  // Las cuentas del diálogo crear se cargan bajo demanda en el cliente.
  const [result, stages] = await Promise.all([
    listCrmDeals({
      tenantId,
      focus,
      sort: "newest",
      page: 1,
      pageSize: DEAL_LIST_KANBAN_PAGE_SIZE,
    }),
    prisma.crmPipelineStage.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
    }),
  ]);

  return (
    <div className="min-w-0">
      <CrmDealsClient
        initialDeals={JSON.parse(JSON.stringify(result.deals))}
        accounts={[]}
        stages={JSON.parse(JSON.stringify(stages))}
        initialFocus={focus}
        initialHasMore={result.hasMore}
        initialTotal={result.total}
      />
    </div>
  );
}
