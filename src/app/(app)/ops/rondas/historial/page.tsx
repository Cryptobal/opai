import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { RondasSubnav } from "@/components/ops/RondasSubnav";
import { OpsControlNocturnoListClient } from "@/components/ops/OpsControlNocturnoListClient";

export default async function RondasHistorialPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/historial");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Historial de turnos nocturnos"
        description="Reportes de controles nocturnos pasados."
      />
      <RondasSubnav />
      <OpsControlNocturnoListClient />
    </div>
  );
}
