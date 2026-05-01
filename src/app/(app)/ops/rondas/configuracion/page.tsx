import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Settings } from "lucide-react";
import { RondasConfiguracionClient } from "@/components/ops/rondas/RondasConfiguracionClient";
import { RondasSubnav } from "@/components/ops/RondasSubnav";

export default async function RondasConfiguracionPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/configuracion");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId;
  const [installations, accounts, checkpointCounts] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: { tenantId, status: "active" },
      select: {
        id: true, name: true, address: true, commune: true, lat: true, lng: true,
        accountId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.crmAccount.findMany({
      where: {
        tenantId,
        installations: { some: { status: "active" } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.opsCheckpoint.groupBy({
      by: ["installationId"],
      where: { tenantId, isActive: true },
      _count: { id: true },
    }),
  ]);

  const installationStats = checkpointCounts.map((c) => ({
    installationId: c.installationId,
    checkpointCount: c._count.id,
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Settings />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Rondas", "Configuración"]}
        title="Configuración de rondas"
        subtitle="checkpoints, plantillas y programación"
        description="Define los puntos de control, agrúpalos en plantillas reutilizables y programa cuándo se ejecutan."
      />
      <RondasSubnav />
      <RondasConfiguracionClient
        installations={JSON.parse(JSON.stringify(installations))}
        clients={JSON.parse(JSON.stringify(accounts))}
        installationStats={installationStats}
      />
    </div>
  );
}
