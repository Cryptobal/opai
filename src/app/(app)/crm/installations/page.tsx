/**
 * CRM Installations Page - Listado global de instalaciones
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmInstallationsListClient } from "@/components/crm";
import { CrmGlobalSearch } from "@/components/crm/CrmGlobalSearch";

export default async function CrmInstallationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/installations");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "installations")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const [installations, accounts, puestosData, asignacionesData] = await Promise.all([
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
        nocturnoEnabled: true,
        createdAt: true,
        updatedAt: true,
        account: { select: { id: true, name: true, type: true, isActive: true } },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.crmAccount.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.opsPuestoOperativo.groupBy({
      by: ["installationId"],
      where: { tenantId, active: true },
      _sum: { requiredGuards: true },
    }),
    prisma.opsAsignacionGuardia.groupBy({
      by: ["installationId"],
      where: { tenantId, isActive: true },
      _count: { id: true },
    }),
  ]);

  const slotsByInstallation = new Map<string, number>();
  for (const row of puestosData) {
    slotsByInstallation.set(row.installationId, row._sum.requiredGuards ?? 0);
  }
  const guardsByInstallation = new Map<string, number>();
  for (const row of asignacionesData) {
    guardsByInstallation.set(row.installationId, row._count.id);
  }

  const initialInstallations = JSON.parse(JSON.stringify(
    installations.map((inst) => ({
      ...inst,
      totalSlots: slotsByInstallation.get(inst.id) ?? 0,
      assignedGuards: guardsByInstallation.get(inst.id) ?? 0,
    }))
  ));
  const initialAccounts = JSON.parse(JSON.stringify(accounts));

  return (
    <>
      <PageHeader
        title="Instalaciones"
        description="Sedes y ubicaciones de clientes"
      />
      <CrmGlobalSearch className="w-full sm:max-w-xs" />
      <CrmInstallationsListClient
        initialInstallations={initialInstallations}
        accounts={initialAccounts}
      />
    </>
  );
}
