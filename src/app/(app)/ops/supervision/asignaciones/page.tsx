import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canEdit, hasCapability } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { UserCheck } from "lucide-react";
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

  const tenantId = session.user.tenantId;

  const [supervisors, installations] = await Promise.all([
    prisma.admin.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, status: "active" },
      select: {
        id: true,
        name: true,
        address: true,
        commune: true,
        account: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<UserCheck />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Supervisión", "Asignaciones"]}
        title="Asignaciones de instalaciones"
        subtitle="supervisores y áreas"
        description="Asigna instalaciones a supervisores para habilitar check-in y visitas de supervisión por área."
      />
      <SupervisorAssignmentsClient
        supervisors={JSON.parse(JSON.stringify(supervisors))}
        installations={JSON.parse(
          JSON.stringify(
            installations.map((i) => ({
              id: i.id,
              name: i.name,
              address: i.address,
              commune: i.commune,
              accountName: i.account?.name ?? "Sin cliente",
            })),
          ),
        )}
      />
    </div>
  );
}
