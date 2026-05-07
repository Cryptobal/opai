import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { ShieldAlert } from "lucide-react";
import { OpsPpcClient } from "@/components/ops";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
export default async function OpsPpcPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/ppc");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "ppc")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;

  const clients = await prisma.crmAccount.findMany({
    where: {
      tenantId,
      type: "client",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      installations: {
        where: { status: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="ops-pautas" />
      <PageHero
        icon={<ShieldAlert />}
        iconTone="emerald"
        eyebrow={["Operaciones", "PPC"]}
        title="Puestos por cubrir"
        subtitle="brechas de cobertura"
        description="Visualización de puestos sin guardia asignado o con vacaciones, licencia o permiso. Prioriza coberturas por instalación."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsPpcClient initialClients={JSON.parse(JSON.stringify(clients))} />
    </div>
  );
}
