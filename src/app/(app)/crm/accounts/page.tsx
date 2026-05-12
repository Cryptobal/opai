/**
 * CRM Accounts Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getInstallationContractCoverage } from "@/lib/crm/installation-contracts";
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
    include: {
      installations: {
        orderBy: { name: "asc" },
        // status: necesario para que el badge "Contrato X/Y" sólo cuente
        // instalaciones activas (las inactivas/prospect no requieren
        // contrato y no deben inflar el denominador).
        select: { id: true, status: true },
      },
      _count: { select: { contacts: true, deals: true, installations: true } },
    },
    orderBy: { name: "asc" },
  });

  const contractCoverage = await getInstallationContractCoverage({
    tenantId,
    installationIds: accounts.flatMap((account) => account.installations.map((installation) => installation.id)),
  });

  const initialAccounts = JSON.parse(JSON.stringify(
    accounts.map(({ installations, ...account }) => {
      const activeInstallations = installations.filter(
        (installation) => installation.status === "active",
      );
      const statuses = activeInstallations.map(
        (installation) =>
          contractCoverage.get(installation.id)?.status ?? "sin_documento",
      );
      const withContract = statuses.filter((status) => status !== "sin_documento").length;
      const expiredContract = statuses.filter((status) => status === "vencido").length;
      const expiringContract = statuses.filter((status) => status === "por_vencer").length;

      return {
        ...account,
        contractCoverage: {
          totalInstallations: activeInstallations.length,
          withContract,
          missingContract: activeInstallations.length - withContract,
          expiredContract,
          expiringContract,
        },
      };
    }),
  ));

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
