import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { OpsControlNocturnoDetailClient } from "@/components/ops/OpsControlNocturnoDetailClient";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";

type Props = { params: Promise<{ id: string }> };

export default async function OpsControlNocturnoDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/control-nocturno");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "control_nocturno")) {
    redirect("/hub");
  }

  const { id } = await params;

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Reporte nocturno"
        description="Detalle del control de guardia nocturna."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <OpsControlNocturnoDetailClient reporteId={id} userRole={session.user.role} />
    </div>
  );
}
