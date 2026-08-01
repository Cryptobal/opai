/**
 * CRM Installations Page - Listado global de instalaciones
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canViewInstallations } from "@/lib/permissions-server";
import {
  INSTALLATION_LIST_DEFAULT_PAGE_SIZE,
  listCrmInstallations,
} from "@/lib/crm/list-installations";
import { CrmInstallationsListClient } from "@/components/crm";

export default async function CrmInstallationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/installations");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canViewInstallations(perms)) redirect("/crm");
  const tenantId = session.user.tenantId;
  const canSeeDeals = canView(perms, "crm", "deals");

  const result = await listCrmInstallations({
    tenantId,
    canSeeDeals,
    status: "active",
    sort: "az",
    page: 1,
    pageSize: INSTALLATION_LIST_DEFAULT_PAGE_SIZE,
    includeCounts: true,
  });

  return (
    <div className="min-w-0">
      <CrmInstallationsListClient
        initialInstallations={JSON.parse(JSON.stringify(result.installations))}
        initialCounts={result.counts ?? { all: 0, active: 0, inactive: 0 }}
        initialHasMore={result.hasMore}
        initialTotal={result.total}
      />
    </div>
  );
}
