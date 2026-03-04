import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { RondasConfiguracionClient } from "@/components/ops/rondas/RondasConfiguracionClient";
import { RondasSubnav } from "@/components/ops/RondasSubnav";

export default async function RondasConfiguracionPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/configuracion");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const [installations, accounts] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true, name: true, address: true, commune: true, lat: true, lng: true,
        accountId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.crmAccount.findMany({
      where: {
        tenantId,
        installations: { some: { isActive: true } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Configuración de rondas"
        description="Gestiona checkpoints, plantillas y programación por instalación."
      />
      <RondasSubnav />
      <RondasConfiguracionClient
        installations={JSON.parse(JSON.stringify(installations))}
        clients={JSON.parse(JSON.stringify(accounts))}
      />
    </div>
  );
}
