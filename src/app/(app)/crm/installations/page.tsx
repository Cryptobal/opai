/**
 * CRM Installations Page - Listado global de instalaciones
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmInstallationsListClient, CrmSubnav } from "@/components/crm";

export default async function CrmInstallationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/installations");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "installations")) redirect("/crm");
  const role = session.user.role;

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const [installations, accounts] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        account: { select: { id: true, name: true, type: true, isActive: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const initialInstallations = JSON.parse(JSON.stringify(installations));
  const initialAccounts = JSON.parse(JSON.stringify(accounts));

  return (
    <>
      <PageHeader
        title="Instalaciones"
        description="Sedes y ubicaciones de clientes"
      />
      <CrmSubnav role={role} />
      <CrmInstallationsListClient
        initialInstallations={initialInstallations}
        accounts={initialAccounts}
      />
    </>
  );
}
