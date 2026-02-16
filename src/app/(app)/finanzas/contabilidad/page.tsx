import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { FinanceSubnav } from "@/components/finance";
import { ContabilidadClient } from "@/components/finance/ContabilidadClient";

export default async function ContabilidadPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/contabilidad");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "contabilidad")) {
    redirect("/finanzas");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canManage = hasCapability(perms, "contabilidad_manage");

  const [accounts, journalEntries, periods] = await Promise.all([
    prisma.financeAccountPlan.findMany({
      where: { tenantId },
      orderBy: { code: "asc" },
    }),
    prisma.financeJournalEntry.findMany({
      where: { tenantId },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.financeAccountingPeriod.findMany({
      where: { tenantId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  const accountsData = accounts.map((a: typeof accounts[number]) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    nature: a.nature,
    parentId: a.parentId,
    level: a.level,
    acceptsEntries: a.acceptsEntries,
    description: a.description,
    taxCode: a.taxCode,
    isActive: a.isActive,
  }));

  const journalData = journalEntries.map((je: typeof journalEntries[number]) => ({
    id: je.id,
    number: je.number,
    date: je.date.toISOString(),
    description: je.description,
    reference: je.reference,
    status: je.status,
    sourceType: je.sourceType,
    totalDebit: je.lines.reduce((sum: number, l: typeof je.lines[number]) => sum + l.debit.toNumber(), 0),
    totalCredit: je.lines.reduce((sum: number, l: typeof je.lines[number]) => sum + l.credit.toNumber(), 0),
    linesCount: je.lines.length,
    createdAt: je.createdAt.toISOString(),
  }));

  const periodsData = periods.map((p: typeof periods[number]) => ({
    id: p.id,
    year: p.year,
    month: p.month,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate.toISOString(),
    status: p.status,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contabilidad"
        description="Plan de cuentas, asientos contables, libro mayor y períodos."
      />
      <FinanceSubnav />
      <ContabilidadClient
        accounts={accountsData}
        journalEntries={journalData}
        periods={periodsData}
        canManage={canManage}
      />
    </div>
  );
}
