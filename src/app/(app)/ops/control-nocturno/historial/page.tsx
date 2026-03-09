import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { OpsControlNocturnoListClient } from "@/components/ops/OpsControlNocturnoListClient";

export default async function OpsControlNocturnoHistorialPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/control-nocturno/historial");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "control_nocturno")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Historial de controles nocturnos"
        description="Reportes de turnos nocturnos pasados."
      />
      <OpsControlNocturnoListClient />
    </div>
  );
}
