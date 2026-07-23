import { redirect } from "next/navigation";
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
    <div className="min-w-0">
      <AsistenciaDiariaClient installations={installations} />
    </div>
  );
}
