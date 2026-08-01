/**
 * CRM Accounts Page
 *
 * Carga solo la primera página + conteos de lifecycle. El listado completo
 * (~miles de prospectos) se pagina vía /api/crm/accounts en el cliente.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import {
  ACCOUNT_LIST_DEFAULT_PAGE_SIZE,
  listCrmAccounts,
} from "@/lib/crm/list-accounts";
import { CrmAccountsClient } from "@/components/crm";

export default async function CrmAccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/accounts");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "accounts")) redirect("/crm");
  const tenantId = session.user.tenantId;
  const canSeeLeads = canView(perms, "crm", "leads");

  // Default del cliente: Clientes activos (filtro más liviano y útil).
  const initialLifecycle = "client_active" as const;

  const result = await listCrmAccounts({
    tenantId,
    canSeeLeads,
    lifecycle: initialLifecycle,
    sort: "az",
    page: 1,
    pageSize: ACCOUNT_LIST_DEFAULT_PAGE_SIZE,
    includeCounts: true,
  });

  const initialAccounts = JSON.parse(JSON.stringify(result.accounts));
  const initialCounts = result.counts ?? {
    prospects: 0,
    clientActive: result.total,
    clientInactive: 0,
    total: result.total,
  };

  return (
    <div className="min-w-0">
      <CrmAccountsClient
        initialAccounts={initialAccounts}
        initialCounts={initialCounts}
        initialHasMore={result.hasMore}
        initialTotal={result.total}
        initialLifecycle={initialLifecycle}
      />
    </div>
  );
}
