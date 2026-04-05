import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { AtsCreateJobClient } from "@/components/ats/AtsCreateJobClient";

export default async function AtsNuevoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/ats/nuevo");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "ats")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;

  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, commune: true, lat: true, lng: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Nuevo aviso de empleo"
        description="Crea un aviso y publícalo en portales de empleo."
        backHref="/ops/ats"
        backLabel="ATS"
      />
      <AtsCreateJobClient
        installations={JSON.parse(JSON.stringify(installations))}
      />
    </div>
  );
}
