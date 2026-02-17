/**
 * CRM Installation Detail Page - Detalle de instalación con mapa
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { CrmInstallationDetailClient } from "@/components/crm";

export default async function CrmInstallationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/installations/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "installations")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const [installation, puestosActivos, puestosHistorial, quotesInstalacion, asignacionGuardias, guardiasActuales, dealsOfAccount] = await Promise.all([
    prisma.crmInstallation.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        isActive: true,
        geoRadiusM: true,
        teMontoClp: true,
        marcacionCode: true,
        notes: true,
        metadata: true,
        nocturnoEnabled: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        leadId: true,
        account: { select: { id: true, name: true, type: true, isActive: true } },
      },
    }),
    prisma.opsPuestoOperativo.findMany({
      where: { tenantId, installationId: id, active: true },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        puestoTrabajoId: true,
        cargoId: true,
        rolId: true,
        shiftStart: true,
        shiftEnd: true,
        weekdays: true,
        requiredGuards: true,
        baseSalary: true,
        teMontoClp: true,
        activeFrom: true,
        puestoTrabajo: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
        rol: { select: { id: true, name: true } },
      },
    }),
    prisma.opsPuestoOperativo.findMany({
      where: { tenantId, installationId: id, active: false },
      orderBy: [{ activeUntil: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        shiftStart: true,
        shiftEnd: true,
        requiredGuards: true,
        activeFrom: true,
        activeUntil: true,
        cargo: { select: { name: true } },
        rol: { select: { name: true } },
      },
    }),
    prisma.cpqQuote.findMany({
      where: { tenantId, installationId: id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        code: true,
        status: true,
        totalPositions: true,
        totalGuards: true,
        updatedAt: true,
      },
      take: 20,
    }),
    prisma.opsAsignacionGuardia.findMany({
      where: { tenantId, installationId: id, isActive: true },
      include: {
        guardia: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        puesto: { select: { id: true, name: true, shiftStart: true, shiftEnd: true } },
      },
      orderBy: [{ puestoId: "asc" }, { slotNumber: "asc" }],
    }),
    // Guardias asignados directamente vía currentInstallationId (migración masiva)
    prisma.opsGuardia.findMany({
      where: { tenantId, currentInstallationId: id, status: "active" },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
      orderBy: [{ persona: { lastName: "asc" } }],
    }),
    // Negocios de la cuenta (para mostrar en sección Negocios)
    prisma.crmInstallation.findFirst({ where: { id, tenantId }, select: { accountId: true } }).then((inst) =>
      inst?.accountId
        ? prisma.crmDeal.findMany({
            where: { tenantId, accountId: inst.accountId },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              title: true,
              amount: true,
              status: true,
              stage: { select: { name: true } },
            },
          })
        : Promise.resolve([])
    ),
  ]);

  if (!installation) {
    redirect("/crm/installations");
  }

  const data = JSON.parse(
    JSON.stringify({
      ...installation,
      puestosActivos,
      puestosHistorial,
      quotesInstalacion,
      asignacionGuardias,
      guardiasActuales,
      dealsOfAccount: dealsOfAccount ?? [],
    })
  );

  const canEditDotacion = canEdit(perms, "crm", "dotacion");

  return (
    <>
      <CrmInstallationDetailClient installation={data} canEditDotacion={canEditDotacion} />
    </>
  );
}
