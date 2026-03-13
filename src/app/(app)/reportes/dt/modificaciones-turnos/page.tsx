import { PageHeader } from "@/components/opai";
import { ModificacionesTurnosClient } from "@/components/reportes-dt/ModificacionesTurnosClient";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";

export default async function ModificacionesTurnosPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Modificaciones de Turnos" description="Res. Exenta N°38 Art. 19 — DT Chile" />
      <ModificacionesTurnosClient installations={installations} />
    </div>
  );
}
