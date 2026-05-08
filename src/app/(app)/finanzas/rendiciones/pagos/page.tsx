import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Wallet } from "lucide-react";
import { PagosPageClient } from "@/components/finance/PagosPageClient";

export default async function PagosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/rendiciones/pagos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasCapability(perms, "rendicion_pay")) {
    redirect("/finanzas/rendiciones");
  }

  const tenantId = session.user.tenantId;

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
        beneficiaryGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const submitterIds = [
    ...new Set(approvedRendiciones.map((r) => r.submitterId)),
  ];
  const payerIds = payments.map((p) => p.paidById);
  const paymentSubmitterIds = payments.flatMap((p) =>
    p.rendiciones.map((r) => r.submitterId)
  );
  const allAdminIds = [
    ...new Set([...submitterIds, ...payerIds, ...paymentSubmitterIds]),
  ];
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

  const pendingData = approvedRendiciones.map((r) => {
    const benefName = r.beneficiaryGuardia
      ? `${r.beneficiaryGuardia.persona?.firstName ?? ""} ${r.beneficiaryGuardia.persona?.lastName ?? ""}`.trim()
      : null;
    return {
      id: r.id,
      code: r.code,
      amount: r.amount,
      date: r.date.toISOString(),
      submitterName: adminMap[r.submitterId] ?? "Desconocido",
      beneficiaryName: benefName,
      itemName: r.item?.name ?? null,
      costCenterName: r.costCenter?.name ?? null,
    };
  });

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Wallet />}
        iconTone="violet"
        title="Pagos"
        subtitle="rendiciones por pagar"
        description="Procesa pagos manuales y archivos bancarios."
      />
      <PagosPageClient
        payments={paymentsData}
        pendingRendiciones={pendingData}
      />
    </div>
  );
}
