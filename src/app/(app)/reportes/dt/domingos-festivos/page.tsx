import { redirect } from "next/navigation";
import { PageHeader } from "@/components/opai-ds";
import { DomingosFestivosClient } from "@/components/reportes-dt/DomingosFestivosClient";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export default async function DomingosFestivosPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");
  const tenantId = session.user.tenantId;
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Domingos y Festivos"
        description="Art. 38 Código del Trabajo — trabajadores que laboraron en domingo o festivo"
      />
      <DomingosFestivosClient installations={installations} />
    </div>
  );
}
