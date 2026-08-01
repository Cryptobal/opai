/**
 * CRM Contacts Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import {
  CONTACT_LIST_DEFAULT_PAGE_SIZE,
  listCrmContacts,
} from "@/lib/crm/list-contacts";
import { CrmContactsClient } from "@/components/crm";

export default async function CrmContactsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/contacts");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "contacts")) redirect("/crm");
  const tenantId = session.user.tenantId;

  const result = await listCrmContacts({
    tenantId,
    filter: "active",
    sort: "newest",
    page: 1,
    pageSize: CONTACT_LIST_DEFAULT_PAGE_SIZE,
    includeCounts: true,
  });

  return (
    <div className="min-w-0">
      <CrmContactsClient
        initialContacts={JSON.parse(JSON.stringify(result.contacts))}
        initialCounts={result.counts ?? { active: 0, all: 0, withAccount: 0, withoutAccount: 0 }}
        initialHasMore={result.hasMore}
        initialTotal={result.total}
      />
    </div>
  );
}
