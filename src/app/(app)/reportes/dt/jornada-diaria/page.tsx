import { PageHeader } from "@/components/opai";
import { JornadaDiariaClient } from "@/components/reportes-dt/JornadaDiariaClient";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";

export default async function JornadaDiariaPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Jornada Diaria"
        description="Res. Exenta N°38 Art. 6 — Horas normales y extraordinarias por trabajador"
      />
      <JornadaDiariaClient installations={installations} />
    </div>
  );
}
