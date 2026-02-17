import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
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

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

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
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Puestos por cubrir (PPC)"
        description="Brechas de cobertura: puestos sin guardia asignado o con vacaciones/licencia/permiso."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsPpcClient initialClients={JSON.parse(JSON.stringify(clients))} />
    </div>
  );
}
