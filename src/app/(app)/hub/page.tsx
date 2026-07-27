import { Suspense } from "react";
import {
  getClosingHubData,
  getFinanceMetrics,
  getOpsMetrics,
  getRecentActivity,
  getTicketMetrics,
  getAlerts,
} from "./_lib/hub-queries";
import { getHubRequestContext } from "./_lib/hub-context";
import { HubSummaryView } from "./_components/HubSummaryView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function HubSectionSkeleton({ h = "h-40" }: { h?: string }) {
  return <div className={`w-full rounded-2xl bg-ds-surface-2 ${h}`} />;
}

async function HubBody() {
  const {
    tenantId,
    userId,
    hubPerms,
    financeCaps,
  } = await getHubRequestContext();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    closingData,
    financeMetrics,
    opsMetrics,
    activities,
    ticketMetrics,
  ] = await Promise.all([
    hubPerms.hasCrm ? getClosingHubData(tenantId, thirtyDaysAgo, now) : null,
    hubPerms.hasFinance ? getFinanceMetrics(tenantId, financeCaps) : null,
    hubPerms.hasOps ? getOpsMetrics(tenantId) : null,
    getRecentActivity(tenantId),
    getTicketMetrics(tenantId, userId),
  ]);

  const alerts = getAlerts(
    opsMetrics,
    null,
    financeMetrics,
    closingData?.kpis.followUpsOverdueCount ?? 0,
  );

  return (
    <HubSummaryView
      hubPerms={hubPerms}
      closingData={closingData}
      financeMetrics={financeMetrics}
      financeCaps={financeCaps}
      opsMetrics={opsMetrics}
      ticketMetrics={ticketMetrics}
      alerts={alerts}
      activities={activities}
    />
  );
}

export default function HubPage() {
  return (
    <Suspense fallback={<HubSectionSkeleton h="h-96" />}>
      <HubBody />
    </Suspense>
  );
}
