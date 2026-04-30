import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai-ds";
import { AlertasCoberturaClient } from "@/components/ops/alertas-cobertura/AlertasCoberturaClient";

export default async function AlertasCoberturaPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/alertas-cobertura");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Alertas de Cobertura"
        description="Gestion de alertas de cobertura nacional — oleadas geograficas, notificacion multi-canal y asignacion de guardias."
      />
      <Suspense>
        <AlertasCoberturaClient
          userRole={session.user.role}
          tenantId={(session.user as any).tenantId}
        />
      </Suspense>
    </div>
  );
}
