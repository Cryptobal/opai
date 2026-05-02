import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { FilePlus } from "lucide-react";
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
  if (!canView(perms, "finance", "contabilidad")) redirect("/finanzas/rendiciones");
  if (!hasCapability(perms, "contabilidad_manage")) {
    redirect("/finanzas/contabilidad");
  }

  const tenantId = session.user.tenantId;

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
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<FilePlus />}
        iconTone="teal"
        eyebrow={["Finanzas", "Contabilidad", "Asientos", "Nuevo"]}
        title="Nuevo asiento contable"
        subtitle="registro manual"
        description="Registre un asiento contable manual."
      />
      <JournalEntryForm accounts={accounts} periods={periods} />
    </div>
  );
}
