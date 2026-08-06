import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { Wallet } from "lucide-react";
import { getOrCreateCashflowConfig } from "@/modules/finance/cashflow/config.service";
import { CashflowConfigClient } from "@/components/finance/cashflow/CashflowConfigClient";
import { prisma } from "@/lib/prisma";

export default async function CashflowConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/finanzas/flujo-caja");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_configure")) {
    redirect("/finanzas");
  }

  const tenantId = session.user.tenantId;
  const [config, unpaidReceivedDteCount, accountOptions] = await Promise.all([
    getOrCreateCashflowConfig(tenantId),
    prisma.financeDte.count({
      where: {
        tenantId,
        direction: "RECEIVED",
        dteType: { in: [33, 34, 46, 56] },
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        voidedByCreditNoteId: null,
        OR: [{ receptionStatus: null }, { receptionStatus: { not: "CLAIMED" } }],
      },
    }),
    prisma.financeAccountPlan.findMany({
      where: { tenantId, isActive: true, acceptsEntries: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <ConfigPageLayout
      icon={<Wallet className="h-[18px] w-[18px]" />}
      title="Flujo de Caja"
      description="Renglones del flujo con cuentas contables, horizontes de proyección y días de pago."
    >
      <CashflowConfigClient
        initialConfig={JSON.parse(JSON.stringify(config))}
        accountOptions={accountOptions}
        unpaidReceivedDteCount={unpaidReceivedDteCount}
      />
    </ConfigPageLayout>
  );
}
