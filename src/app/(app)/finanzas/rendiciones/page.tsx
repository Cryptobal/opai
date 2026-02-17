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

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const canSubmit = hasCapability(perms, "rendicion_submit");
  const canViewAll = hasCapability(perms, "rendicion_view_all");

  // Fetch rendiciones - if user can view all, show all; otherwise only theirs
  const whereClause = canViewAll
    ? { tenantId }
    : { tenantId, submitterId: session.user.id };

  const [rendiciones, items] = await Promise.all([
    prisma.financeRendicion.findMany({
      where: whereClause,
      include: {
        item: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
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

  // Resolve submitter names
  const submitterIds = [...new Set(rendiciones.map((r) => r.submitterId))];
  const submitters = await prisma.admin.findMany({
    where: { id: { in: submitterIds } },
    select: { id: true, name: true },
  });
  const submitterMap = Object.fromEntries(submitters.map((s) => [s.id, s.name]));

  const data = rendiciones.map((r) => ({
    id: r.id,
    code: r.code,
    date: r.date.toISOString(),
    type: r.type,
    amount: r.amount,
    status: r.status,
    description: r.description,
    itemName: r.item?.name ?? null,
    costCenterName: r.costCenter?.name ?? null,
    submitterName: submitterMap[r.submitterId] ?? "Desconocido",
    submitterId: r.submitterId,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rendiciones"
        description="Listado de rendiciones de gastos y kilometraje."
      />
      <RendicionesClient
        rendiciones={data}
        items={items}
        canSubmit={canSubmit}
        currentUserId={session.user.id}
      />
    </div>
  );
}
