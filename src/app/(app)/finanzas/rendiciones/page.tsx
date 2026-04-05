import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
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

  const [rendiciones, items] = await Promise.all([
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
  ]);

  // Resolve submitter names + beneficiary admin names
  const submitterIds = [...new Set(rendiciones.map((r) => r.submitterId))];
  const beneficiaryAdminIds = rendiciones
    .map((r) => r.beneficiaryAdminId)
    .filter((id): id is string => !!id);
  const allAdminIds = [...new Set([...submitterIds, ...beneficiaryAdminIds])];

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
      />
    </div>
  );
}
