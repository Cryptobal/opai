import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { RondasAlertasClient } from "@/components/ops/rondas";

export default async function RondasAlertasPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/alertas");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const rows = await prisma.opsAlertaRonda.findMany({
    where: { tenantId, resuelta: false },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas de rondas"
        description="Alertas automáticas por geolocalización, secuencia y comportamiento anómalo."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <RondasAlertasClient initialRows={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
