import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Megaphone } from "lucide-react";
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
      <PageHero
        icon={<Megaphone />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Alertas Cobertura"]}
        title="Alertas de Cobertura"
        subtitle="oleadas geográficas y notificación masiva"
        description="Gestión de alertas de cobertura — oleadas geográficas, notificación multi-canal (push/SMS/email) y asignación de guardias en cadena."
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
