import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { AlertasCoberturaConfig } from "@/components/opai/configuracion/AlertasCoberturaConfig";

export default async function ConfigAlertasCoberturaPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/alertas-cobertura");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Alertas de Cobertura"
        description="Configuración de oleadas, tiempos, canales de notificación y parámetros del módulo."
      />
      <AlertasCoberturaConfig />
    </div>
  );
}
