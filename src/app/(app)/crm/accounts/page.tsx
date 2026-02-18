/**
 * CRM Accounts Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmAccountsClient } from "@/components/crm";
import { CrmGlobalSearch } from "@/components/crm/CrmGlobalSearch";

export default async function CrmAccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/accounts");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "accounts")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());

  const canSeeLeads = canView(perms, "crm", "leads");
  const accounts = await prisma.crmAccount.findMany({
    where: {
      tenantId,
      ...(!canSeeLeads ? { type: "client", isActive: true } : {}),
    },
    include: { _count: { select: { contacts: true, deals: true } } },
    orderBy: { createdAt: "desc" },
  });

  const initialAccounts = JSON.parse(JSON.stringify(accounts));

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Prospectos y clientes"
      />
      <CrmGlobalSearch className="w-full sm:max-w-xs" />
      <CrmAccountsClient initialAccounts={initialAccounts} />
    </>
  );
}
