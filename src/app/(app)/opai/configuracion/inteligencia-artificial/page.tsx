import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { AiProvidersConfigClient } from "@/components/configuracion/AiProvidersConfigClient";

export default async function InteligenciaArtificialConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Inteligencia Artificial"
        description="Configura el proveedor y modelo de IA para generación de protocolos, exámenes, cotizaciones y más."
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <AiProvidersConfigClient />
    </div>
  );
}
