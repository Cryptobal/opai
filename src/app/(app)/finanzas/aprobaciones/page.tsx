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
import { AprobacionesClient } from "@/components/finance/AprobacionesClient";

export default async function AprobacionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/aprobaciones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }
  if (!canView(perms, "finance", "aprobaciones")) redirect("/finanzas/rendiciones");
  if (!hasCapability(perms, "rendicion_approve")) {
    redirect("/finanzas");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const userId = session.user.id;

  // Fetch rendiciones pending approval where current user is an approver
  const approvals = await prisma.financeApproval.findMany({
    where: {
      approverId: userId,
      decision: null,
      rendicion: {
        tenantId,
        status: { in: ["SUBMITTED", "IN_APPROVAL"] },
      },
    },
    include: {
      rendicion: {
        include: {
          item: { select: { id: true, name: true } },
          costCenter: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Resolve submitter names
  const submitterIds = [
    ...new Set(approvals.map((a) => a.rendicion.submitterId)),
  ];
  const submitters = await prisma.admin.findMany({
    where: { id: { in: submitterIds } },
    select: { id: true, name: true },
  });
  const submitterMap = Object.fromEntries(
    submitters.map((s) => [s.id, s.name])
  );

  const data = approvals.map((a) => ({
    approvalId: a.id,
    rendicionId: a.rendicion.id,
    code: a.rendicion.code,
    type: a.rendicion.type,
    amount: a.rendicion.amount,
    date: a.rendicion.date.toISOString(),
    description: a.rendicion.description,
    status: a.rendicion.status,
    itemName: a.rendicion.item?.name ?? null,
    costCenterName: a.rendicion.costCenter?.name ?? null,
    submitterName: submitterMap[a.rendicion.submitterId] ?? "Desconocido",
    submittedAt: a.rendicion.submittedAt?.toISOString() ?? null,
    approvalOrder: a.approvalOrder,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aprobaciones"
        description="Rendiciones pendientes de tu aprobación."
      />
      <AprobacionesClient pendingApprovals={data} />
    </div>
  );
}
