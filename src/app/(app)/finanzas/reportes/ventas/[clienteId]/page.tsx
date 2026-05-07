import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
  hasCapability,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ClienteDrillClient } from "@/components/finance/reports/ClienteDrillClient";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";
import { getSalesMatrix } from "@/modules/finance/reports/sales-matrix.service";
import { getPurchasesMatrix } from "@/modules/finance/reports/purchases-matrix.service";

export const dynamic = "force-dynamic";

export default async function ClienteDrillPage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  const { clienteId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/opai/login");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    redirect("/finanzas");
  }

  const account = await prisma.crmAccount.findFirst({
    where: { tenantId: session.user.tenantId, id: clienteId },
    select: {
      id: true,
      name: true,
      industry: true,
      status: true,
      installations: { select: { id: true, name: true } },
    },
  });
  if (!account) notFound();

  const period = buildPeriod("year", new Date());
  const filters = { crmAccountIds: [clienteId] };
  const [sales, purchases] = await Promise.all([
    getSalesMatrix(session.user.tenantId, period, filters),
    getPurchasesMatrix(session.user.tenantId, period, filters),
  ]);

  return (
    <div className="space-y-5">
      <PageHero
        icon={<Building2 />}
        iconTone="emerald"
        title={account.name}
        subtitle={account.industry ?? "Sin sector"}
        description={`Ficha financiera del cliente · ${account.installations.length} instalación(es)`}
        backHref="/finanzas/reportes/ventas"
      />
      <ClienteDrillClient
        accountId={clienteId}
        accountName={account.name}
        installations={account.installations}
        sales={sales}
        purchases={purchases}
        initialPeriod={period}
      />
    </div>
  );
}
