import { redirect } from "next/navigation";
import { PageHero } from "@/components/opai-ds";
import { History } from "lucide-react";
import { ModificacionesTurnosClient } from "@/components/reportes-dt/ModificacionesTurnosClient";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export default async function ModificacionesTurnosPage() {
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
      <PageHero
        icon={<History />}
        iconTone="teal"
        eyebrow={["Reportes", "DT", "Modificaciones"]}
        title="Modificaciones de Turnos"
        subtitle="Res. N°38 Art. 19"
        description="Res. Exenta N°38 Art. 19 — DT Chile"
      />
      <ModificacionesTurnosClient installations={installations} />
    </div>
  );
}
