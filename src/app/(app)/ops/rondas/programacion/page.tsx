import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsSubnav } from "@/components/ops";
import { RondasSubnav, RondasProgramacionClient } from "@/components/ops/rondas";

export default async function RondasProgramacionPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/programacion");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const templates = await prisma.opsRondaTemplate.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const programaciones = await prisma.opsRondaProgramacion.findMany({
    where: { tenantId },
    include: { rondaTemplate: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programación de rondas"
        description="Define días, horarios y frecuencia de ejecución."
      />
      <OpsSubnav />
      <RondasSubnav />
      <RondasProgramacionClient
        templates={JSON.parse(JSON.stringify(templates))}
        initialRows={JSON.parse(JSON.stringify(programaciones))}
      />
    </div>
  );
}
