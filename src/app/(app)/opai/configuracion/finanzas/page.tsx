import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { ConfigClient } from "@/components/finance/ConfigClient";

export default async function FinanzasConfiguracionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/finanzas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "config")) {
    redirect("/hub");
  }
  if (!hasCapability(perms, "rendicion_configure")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [config, items, costCenters, approvers] = await Promise.all([
    prisma.financeRendicionConfig.findUnique({
      where: { tenantId },
    }),
    prisma.financeRendicionItem.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    }),
    prisma.financeCostCenter.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    }),
    prisma.admin.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const configData = config
    ? {
        kmPerLiter: Number(config.kmPerLiter),
        fuelPricePerLiter: config.fuelPricePerLiter,
        vehicleFeePct: Number(config.vehicleFeePct),
        requireImage: config.requireImage,
        requireObservations: config.requireObservations,
        requireTollImage: config.requireTollImage,
        defaultApprover1Id: config.defaultApprover1Id,
        defaultApprover2Id: config.defaultApprover2Id,
        maxDailyAmount: config.maxDailyAmount,
        maxMonthlyAmount: config.maxMonthlyAmount,
        pendingAlertDays: config.pendingAlertDays,
        approvalAlertDays: config.approvalAlertDays,
        santanderAccountNumber: config.santanderAccountNumber,
      }
    : null;

  const itemsData = items.map((i) => ({
    id: i.id,
    name: i.name,
    code: i.code,
    category: i.category,
    active: i.active,
    maxPerDay: i.maxPerDay,
    maxPerMonth: i.maxPerMonth,
    accountCode: i.accountCode,
  }));

  const costCentersData = costCenters.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    active: c.active,
  }));

  const approverOptions = approvers.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Configuración de Finanzas"
        description="Administra ítems de rendición, parámetros de kilometraje, aprobadores y reglas."
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <ConfigClient
        config={configData}
        items={itemsData}
        costCenters={costCentersData}
        approverOptions={approverOptions}
      />
    </div>
  );
}
