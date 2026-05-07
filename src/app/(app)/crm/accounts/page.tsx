/**
 * CRM Accounts Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Building2 } from "lucide-react";
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
      <PageHero
        icon={<Building2 />}
        iconTone="violet"
        title="Cuentas"
        subtitle="prospectos y clientes"
        description="Listado de empresas en el portafolio. Cada cuenta agrupa sus contactos, instalaciones, negocios, cotizaciones y contratos."
      />
      <CrmAccountsClient initialAccounts={initialAccounts} />
    </>
  );
}
