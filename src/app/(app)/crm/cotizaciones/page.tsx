/**
 * CRM - Cotizaciones (CPQ)
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getUfValue } from "@/lib/uf";
import {
  QUOTE_LIST_DEFAULT_PAGE_SIZE,
  listCrmQuotes,
} from "@/lib/crm/list-quotes";
import { CrmCotizacionesClient } from "@/components/crm/CrmCotizacionesClient";

export default async function CrmCotizacionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/cotizaciones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "quotes")) redirect("/crm");
  const tenantId = session.user.tenantId;

  const [result, ufValue] = await Promise.all([
    listCrmQuotes({
      tenantId,
      status: "all",
      sort: "newest",
      page: 1,
      pageSize: QUOTE_LIST_DEFAULT_PAGE_SIZE,
      includeCounts: true,
    }),
    getUfValue(),
  ]);

  return (
    <div className="min-w-0">
      <CrmCotizacionesClient
        quotes={JSON.parse(JSON.stringify(result.quotes))}
        ufValue={ufValue}
        initialCounts={result.counts ?? {
          total: 0,
          draft: 0,
          sent: 0,
          approved: 0,
          rejected: 0,
        }}
        initialHasMore={result.hasMore}
        initialTotal={result.total}
      />
    </div>
  );
}
