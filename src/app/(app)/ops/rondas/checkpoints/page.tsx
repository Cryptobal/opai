import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsSubnav } from "@/components/ops";
import { RondasSubnav, RondasCheckpointsClient } from "@/components/ops/rondas";

export default async function RondasCheckpointsPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/checkpoints");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const checkpoints = await prisma.opsCheckpoint.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checkpoints QR"
        description="Configura puntos de marcación por instalación."
      />
      <OpsSubnav />
      <RondasSubnav />
      <RondasCheckpointsClient
        installations={JSON.parse(JSON.stringify(installations))}
        initialCheckpoints={JSON.parse(JSON.stringify(checkpoints))}
      />
    </div>
  );
}
