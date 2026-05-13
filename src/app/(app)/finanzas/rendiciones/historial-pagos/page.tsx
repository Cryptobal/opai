// Historial de pagos de rendiciones. La creación de pagos vive ahora en la
// lista unificada (`/finanzas/rendiciones`). Esta página solo muestra el listado
// histórico de FinancePayment.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { FinanceN3Chips } from "@/components/finance/FinanceN3Chips";
import { Wallet } from "lucide-react";
import { PagosPageClient } from "@/components/finance/PagosPageClient";

export default async function HistorialPagosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect(
      "/opai/login?callbackUrl=/finanzas/rendiciones/historial-pagos",
    );
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasCapability(perms, "rendicion_pay")) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;

  const payments = await prisma.financePayment.findMany({
    where: { tenantId },
    include: {
      rendiciones: {
        select: { id: true, code: true, amount: true, submitterId: true },
      },
    },
    orderBy: { paidAt: "desc" },
    take: 200,
  });

  const payerIds = payments.map((p) => p.paidById);
  const submitterIds = payments.flatMap((p) =>
    p.rendiciones.map((r) => r.submitterId),
  );
  const allAdminIds = [...new Set([...payerIds, ...submitterIds])];
  const admins = await prisma.admin.findMany({
    where: { id: { in: allAdminIds } },
    select: { id: true, name: true },
  });
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.name]));

  const paymentsData = payments.map((p) => ({
    id: p.id,
    code: p.code,
    type: p.type,
    totalAmount: p.totalAmount,
    rendicionCount: p.rendicionCount,
    paidByName: adminMap[p.paidById] ?? "Desconocido",
    paidAt: p.paidAt.toISOString(),
    bankFileName: p.bankFileName,
    bankFileUrl: p.bankFileUrl,
    receiptFileName: p.receiptFileName,
    receiptUrl: p.receiptUrl,
    notes: p.notes,
    rendiciones: p.rendiciones.map((r) => ({
      id: r.id,
      code: r.code,
      amount: r.amount,
      submitterName: adminMap[r.submitterId] ?? "Desconocido",
    })),
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Wallet />}
        iconTone="violet"
        title="Historial de pagos"
        subtitle="rendiciones pagadas"
        description="Listado histórico de pagos generados. Los nuevos pagos se crean desde la lista de rendiciones."
      />
      <FinanceN3Chips submoduleKey="finance-rendiciones" />
      <PagosPageClient
        payments={paymentsData}
        pendingRendiciones={[]}
        historyOnly
      />
    </div>
  );
}
