import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { ConfigClient } from "@/components/finance/ConfigClient";
import { Receipt } from "lucide-react";

export default async function FinanzasConfiguracionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/finanzas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "finanzas")) {
    redirect("/opai/configuracion");
  }
  if (!hasCapability(perms, "rendicion_configure")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId;

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
    installationId: c.installationId ?? null,
  }));

  const approverOptions = approvers.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
  }));

  return (
    <ConfigPageLayout
      title="Finanzas"
      description="Administra ítems de rendición, parámetros de kilometraje, aprobadores y reglas."
      icon={<Receipt className="h-[18px] w-[18px]" />}
    >
      <ConfigClient
        config={configData}
        items={itemsData}
        costCenters={costCentersData}
        approverOptions={approverOptions}
      />
    </ConfigPageLayout>
  );
}
