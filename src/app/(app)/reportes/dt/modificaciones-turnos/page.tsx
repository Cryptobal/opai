import { redirect } from "next/navigation";
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
    <div className="min-w-0">
      <ModificacionesTurnosClient installations={installations} />
    </div>
  );
}
