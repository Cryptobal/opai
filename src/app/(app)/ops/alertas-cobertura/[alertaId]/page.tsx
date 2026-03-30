import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { AlertaDetalleClient } from "@/components/ops/alertas-cobertura/AlertaDetalleClient";

export default async function AlertaDetallePage({
  params,
}: {
  params: Promise<{ alertaId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/alertas-cobertura");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops")) {
    redirect("/hub");
  }

  const { alertaId } = await params;

  return (
    <div className="space-y-6 min-w-0">
      <AlertaDetalleClient
        alertaId={alertaId}
        tenantId={(session.user as any).tenantId}
      />
    </div>
  );
}
