import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { AlertasCoberturaConfig } from "@/components/opai/configuracion/AlertasCoberturaConfig";
import { Siren } from "lucide-react";

export default async function ConfigAlertasCoberturaPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/alertas-cobertura");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "alertas_cobertura")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Alertas de Cobertura"
      description="Configuración de oleadas, tiempos, canales de notificación y parámetros del módulo."
      icon={Siren}
    >
      <AlertasCoberturaConfig />
    </ConfigPageLayout>
  );
}
