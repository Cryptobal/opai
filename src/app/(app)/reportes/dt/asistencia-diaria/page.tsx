import { redirect } from "next/navigation";
import { PageHeader } from "@/components/opai";
import { AsistenciaDiariaClient } from "@/components/reportes-dt/AsistenciaDiariaClient";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export default async function AsistenciaDiariaPage() {
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
      <PageHeader title="Asistencia Diaria" description="Res. Exenta N°38 Art. 4 — DT Chile" />
      <AsistenciaDiariaClient installations={installations} />
    </div>
  );
}
