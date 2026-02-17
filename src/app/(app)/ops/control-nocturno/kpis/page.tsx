import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { ControlNocturnoKpisClient } from "@/components/ops/ControlNocturnoKpisClient";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";

export default async function ControlNocturnoKpisPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/control-nocturno/kpis");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "control_nocturno")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPIs Control Nocturno"
        description="Cumplimiento de rondas, tendencias y alertas por instalación."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <ControlNocturnoKpisClient />
    </div>
  );
}
