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
import { PagosClient } from "@/components/finance/PagosClient";

export default async function PagosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/pagos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "pagos")) redirect("/finanzas/rendiciones");
  if (!hasCapability(perms, "rendicion_pay")) {
    redirect("/finanzas");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [payments, approvedRendiciones] = await Promise.all([
    prisma.financePayment.findMany({
      where: { tenantId },
      include: {
        rendiciones: {
          select: { id: true, code: true, amount: true, submitterId: true },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 100,
    }),
    prisma.financeRendicion.findMany({
      where: { tenantId, status: "APPROVED", paymentId: null },
      include: {
        item: { select: { name: true } },
        costCenter: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Resolve payer and submitter names
  const allUserIds = [
    ...new Set([
      ...payments.map((p) => p.paidById),
      ...approvedRendiciones.map((r) => r.submitterId),
      ...payments.flatMap((p) => p.rendiciones.map((r) => r.submitterId)),
    ]),
  ];
  const users = await prisma.admin.findMany({
    where: { id: { in: allUserIds } },
    select: { id: true, name: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

  const paymentsData = payments.map((p) => ({
    id: p.id,
    code: p.code,
    type: p.type,
    totalAmount: p.totalAmount,
    rendicionCount: p.rendicionCount,
    paidByName: userMap[p.paidById] ?? "Desconocido",
    paidAt: p.paidAt.toISOString(),
    bankFileName: p.bankFileName,
    bankFileUrl: p.bankFileUrl,
    notes: p.notes,
    rendiciones: p.rendiciones.map((r) => ({
      id: r.id,
      code: r.code,
      amount: r.amount,
      submitterName: userMap[r.submitterId] ?? "Desconocido",
    })),
  }));

  const pendingData = approvedRendiciones.map((r) => ({
    id: r.id,
    code: r.code,
    amount: r.amount,
    date: r.date.toISOString(),
    submitterName: userMap[r.submitterId] ?? "Desconocido",
    itemName: r.item?.name ?? null,
    costCenterName: r.costCenter?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Procesa pagos de rendiciones aprobadas."
      />
      <PagosClient payments={paymentsData} pendingRendiciones={pendingData} />
    </div>
  );
}
