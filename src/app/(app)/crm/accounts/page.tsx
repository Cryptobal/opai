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
        select: { id: true, status: true },
      },
      _count: { select: { contacts: true, deals: true, installations: true } },
    },
    orderBy: { name: "asc" },
  });

  const accountIds = accounts.map((a) => a.id);
  const allInstallationIds = accounts.flatMap((a) => a.installations.map((i) => i.id));

  // Batch: cobertura de contratos, FC items y puestos operativos en paralelo
  const [contractCoverage, cashflowItems, puestos] = await Promise.all([
    getInstallationContractCoverage({ tenantId, installationIds: allInstallationIds }),

    // FC items de contratos activos: source=CONTRACT (nuevo) o source=OTHER
    // con crmAccountId (legacy pre-11-may-2026). Ambos representan ingresos
    // por contrato vinculados explícitamente a una cuenta.
    accountIds.length > 0
      ? prisma.financeCashflowItem.findMany({
          where: {
            tenantId,
            source: { in: ["CONTRACT", "OTHER"] },
            isActive: true,
            crmAccountId: { in: accountIds },
          },
          select: { crmAccountId: true, amount: true, currency: true },
        })
      : Promise.resolve([]),

    // Puestos operativos activos por instalación
    allInstallationIds.length > 0
      ? prisma.opsPuestoOperativo.findMany({
          where: { tenantId, installationId: { in: allInstallationIds }, active: true },
          select: { installationId: true, requiredGuards: true },
        })
      : Promise.resolve([]),
  ]);

  // FC: cuenta e importe mensual por cuenta
  const cashflowCountByAccount = new Map<string, number>();
  const cashflowAmountByAccount = new Map<string, { amount: number; currency: string }>();
  for (const item of cashflowItems) {
    if (!item.crmAccountId) continue;
    cashflowCountByAccount.set(item.crmAccountId, (cashflowCountByAccount.get(item.crmAccountId) ?? 0) + 1);
    const prev = cashflowAmountByAccount.get(item.crmAccountId);
    if (!prev) {
      cashflowAmountByAccount.set(item.crmAccountId, { amount: Number(item.amount), currency: item.currency ?? "CLP" });
    } else {
      cashflowAmountByAccount.set(item.crmAccountId, {
        amount: prev.amount + Number(item.amount),
        currency: prev.currency === item.currency ? prev.currency : "CLP",
      });
    }
  }

  // Guardias: requiredGuards por installationId
  const guardsByInstallation = new Map<string, number>();
  for (const p of puestos) {
    guardsByInstallation.set(p.installationId, (guardsByInstallation.get(p.installationId) ?? 0) + p.requiredGuards);
  }

  const initialAccounts = JSON.parse(JSON.stringify(
    accounts.map(({ installations, ...account }) => {
      const activeInstallations = installations.filter((i) => i.status === "active");
      const statuses = activeInstallations.map(
        (i) => contractCoverage.get(i.id)?.status ?? "sin_documento",
      );
      const withContract = statuses.filter((s) => s !== "sin_documento").length;
      const expiredContract = statuses.filter((s) => s === "vencido").length;
      const expiringContract = statuses.filter((s) => s === "por_vencer").length;
      const activeGuardsCount = activeInstallations.reduce(
        (sum, i) => sum + (guardsByInstallation.get(i.id) ?? 0), 0,
      );

      return {
        ...account,
        contractCoverage: {
          totalInstallations: activeInstallations.length,
          withContract,
          missingContract: activeInstallations.length - withContract,
          expiredContract,
          expiringContract,
        },
        cashflowItemCount: cashflowCountByAccount.get(account.id) ?? 0,
        cashflowMonthlyAmount: cashflowAmountByAccount.get(account.id) ?? null,
        activeGuardsCount,
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
