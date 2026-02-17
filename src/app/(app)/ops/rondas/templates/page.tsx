import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { RondasTemplatesClient } from "@/components/ops/rondas";

export default async function RondasTemplatesPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/templates");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (!installations.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plantillas de ronda" description="No hay instalaciones activas para crear plantillas." />
        <OpsGlobalSearch className="w-full sm:max-w-xs" />
      </div>
    );
  }

  const installation = installations[0];
  const checkpoints = await prisma.opsCheckpoint.findMany({
    where: { tenantId, installationId: installation.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const templates = await prisma.opsRondaTemplate.findMany({
    where: { tenantId, installationId: installation.id },
    include: {
      checkpoints: {
        include: { checkpoint: { select: { id: true, name: true } } },
        orderBy: { orderIndex: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Plantillas de ronda" description="Configura plantillas por instalación." />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <RondasTemplatesClient
        installations={JSON.parse(JSON.stringify(installations))}
        initialInstallationId={installation.id}
        initialCheckpoints={JSON.parse(JSON.stringify(checkpoints))}
        initialTemplates={JSON.parse(JSON.stringify(templates))}
      />
    </div>
  );
}
