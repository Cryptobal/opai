import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { OpsControlNocturnoListClient } from "@/components/ops/OpsControlNocturnoListClient";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";

export default async function OpsControlNocturnoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/control-nocturno");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "control_nocturno")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control nocturno"
        description="Reportes de la central de operaciones nocturna."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsControlNocturnoListClient userRole={session.user.role} />
    </div>
  );
}
