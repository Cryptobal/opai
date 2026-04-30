import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai-ds";
import { RendicionesClient } from "@/components/finance/RendicionesClient";

export default async function RendicionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/rendiciones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;

  const canSubmit = hasCapability(perms, "rendicion_submit");
  const canViewAll = hasCapability(perms, "rendicion_view_all");

  // Fetch rendiciones - if user can view all, show all; otherwise only theirs
  const whereClause = canViewAll
    ? { tenantId }
    : { tenantId, submitterId: session.user.id };

  const canApprove = hasCapability(perms, "rendicion_approve");
  const canPay = hasCapability(perms, "rendicion_pay");

  const [rendiciones, items, payments, approvedRendiciones] = await Promise.all([
    prisma.financeRendicion.findMany({
      where: whereClause,
      include: {
        item: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
        beneficiaryGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.financeRendicionItem.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
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

  // Resolve submitter names + beneficiary admin names + payment payers
  const submitterIds = [...new Set(rendiciones.map((r) => r.submitterId))];
  const beneficiaryAdminIds = rendiciones
    .map((r) => r.beneficiaryAdminId)
    .filter((id): id is string => !!id);
  const payerIds = payments.map((p) => p.paidById);
  const paymentSubmitterIds = payments.flatMap((p) =>
    p.rendiciones.map((r) => r.submitterId)
  );
  const pendingSubmitterIds = approvedRendiciones.map((r) => r.submitterId);
  const allAdminIds = [
    ...new Set([
      ...submitterIds,
      ...beneficiaryAdminIds,
      ...payerIds,
      ...paymentSubmitterIds,
      ...pendingSubmitterIds,
    ]),
  ];

  const admins = await prisma.admin.findMany({
    where: { id: { in: allAdminIds } },
    select: { id: true, name: true },
  });
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.name]));

  const data = rendiciones.map((r) => {
    let beneficiaryName: string | null = null;
    if (r.beneficiaryGuardia?.persona) {
      const p = r.beneficiaryGuardia.persona;
      beneficiaryName = `${p.firstName} ${p.lastName}`.trim();
    } else if (r.beneficiaryAdminId) {
      beneficiaryName = adminMap[r.beneficiaryAdminId] ?? null;
    }

    return {
      id: r.id,
      code: r.code,
      date: r.date.toISOString(),
      type: r.type,
      amount: r.amount,
      status: r.status,
      description: r.description,
      itemName: r.item?.name ?? null,
      costCenterName: r.costCenter?.name ?? null,
      submitterName: adminMap[r.submitterId] ?? "Desconocido",
      submitterId: r.submitterId,
      beneficiaryName,
      createdAt: r.createdAt.toISOString(),
    };
  });

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
      <PageHeader
        title="Rendiciones"
        description="Listado de rendiciones de gastos y kilometraje."
      />
      <RendicionesClient
        rendiciones={data}
        items={items}
        canSubmit={canSubmit}
        canApprove={canApprove}
        canPay={canPay}
        currentUserId={session.user.id}
        payments={paymentsData}
        pendingRendiciones={pendingData}
      />
    </div>
  );
}
