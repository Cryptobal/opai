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
import { JournalEntryForm } from "@/components/finance/JournalEntryForm";

export default async function NuevoAsientoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/contabilidad/asientos/nuevo");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!hasCapability(perms, "contabilidad_manage")) {
    redirect("/finanzas/contabilidad");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [accounts, periods] = await Promise.all([
    prisma.financeAccountPlan.findMany({
      where: { tenantId, isActive: true, acceptsEntries: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.financeAccountingPeriod.findMany({
      where: { tenantId, status: "OPEN" },
      select: { id: true, year: true, month: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo asiento contable"
        description="Registre un asiento contable manual."
      />
      <JournalEntryForm accounts={accounts} periods={periods} />
    </div>
  );
}
