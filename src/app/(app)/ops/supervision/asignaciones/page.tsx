import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canEdit, hasCapability } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { SupervisorAssignmentsClient } from "@/components/supervision/SupervisorAssignmentsClient";

export default async function SupervisionAsignacionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/asignaciones");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canEdit(perms, "ops", "supervision") || !hasCapability(perms, "supervision_view_all")) {
    redirect("/ops/supervision");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [supervisors, installations] = await Promise.all([
    prisma.admin.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { role: "supervisor" },
          { roleTemplate: { slug: "supervisor" } },
        ],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, address: true, commune: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asignaciones de supervisores"
        description="Asigna instalaciones a supervisores para habilitar check-in y visitas de supervisión."
      />
      <SupervisorAssignmentsClient
        supervisors={JSON.parse(JSON.stringify(supervisors))}
        installations={JSON.parse(JSON.stringify(installations))}
      />
    </div>
  );
}
