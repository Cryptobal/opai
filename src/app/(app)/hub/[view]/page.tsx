import { notFound, redirect } from "next/navigation";
import {
  getAtsMetrics,
  getClosingHubData,
  getDocsSignals,
  getFinanceMetrics,
  getOpsMetrics,
  getPayrollMetrics,
  getPersonasMetrics,
  getSupervisionMetrics,
  getTicketMetrics,
  getUpcomingProjects,
} from "../_lib/hub-queries";
import { getHubRequestContext } from "../_lib/hub-context";
import {
  HubCommercialView,
  HubFinanceView,
  HubOperationsView,
  HubPayrollView,
  HubPeopleView,
} from "../_components/HubDomainViews";
import { HubDocumentsView } from "../_components/HubDocumentsView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HUB_VIEWS = [
  "comercial",
  "operaciones",
  "finanzas",
  "personas",
  "payroll",
  "documentos",
] as const;

type HubView = (typeof HUB_VIEWS)[number];

function isHubView(value: string): value is HubView {
  return (HUB_VIEWS as readonly string[]).includes(value);
}

export default async function HubViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!isHubView(view)) notFound();

  const {
    tenantId,
    userId,
    firstName,
    hubPerms,
    financeCaps,
  } = await getHubRequestContext();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  switch (view) {
    case "comercial": {
      if (!hubPerms.hasCrm) redirect("/hub");
      const [closingData, upcomingProjects] = await Promise.all([
        getClosingHubData(tenantId, thirtyDaysAgo, now),
        getUpcomingProjects(tenantId),
      ]);
      return (
        <HubCommercialView
          hubPerms={hubPerms}
          closingData={closingData}
          sellerFirstName={firstName}
          upcomingProjects={upcomingProjects}
        />
      );
    }

    case "operaciones": {
      if (!hubPerms.hasOps) redirect("/hub");
      const [opsMetrics, ticketMetrics, supervisionMetrics] = await Promise.all([
        getOpsMetrics(tenantId),
        getTicketMetrics(tenantId, userId),
        hubPerms.hasSupervision ? getSupervisionMetrics(tenantId) : null,
      ]);
      return (
        <HubOperationsView
          opsMetrics={opsMetrics}
          ticketMetrics={ticketMetrics}
          supervisionMetrics={supervisionMetrics}
        />
      );
    }

    case "finanzas": {
      if (!hubPerms.hasFinance) redirect("/hub");
      const [financeMetrics, opsMetrics] = await Promise.all([
        getFinanceMetrics(tenantId, financeCaps),
        hubPerms.hasOps ? getOpsMetrics(tenantId) : null,
      ]);
      return (
        <HubFinanceView
          financeMetrics={financeMetrics}
          financeCaps={financeCaps}
          opsMetrics={opsMetrics}
        />
      );
    }

    case "personas": {
      if (!hubPerms.hasPersonas) redirect("/hub");
      const [personasMetrics, atsMetrics] = await Promise.all([
        getPersonasMetrics(tenantId),
        hubPerms.hasAts ? getAtsMetrics(tenantId) : null,
      ]);
      if (!personasMetrics) redirect("/hub");
      return (
        <HubPeopleView
          personasMetrics={personasMetrics}
          atsMetrics={atsMetrics}
        />
      );
    }

    case "payroll": {
      if (!hubPerms.hasPayroll) redirect("/hub");
      const metrics = await getPayrollMetrics(tenantId);
      if (!metrics) redirect("/hub");
      return <HubPayrollView metrics={metrics} />;
    }

    case "documentos": {
      if (!hubPerms.hasDocs) redirect("/hub");
      const signals = await getDocsSignals(tenantId, thirtyDaysAgo);
      return <HubDocumentsView signals={signals} />;
    }
  }
}
