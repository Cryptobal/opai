import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { AiProvidersConfigClient } from "@/components/opai/AiProvidersConfigClient";
import { Sparkles } from "lucide-react";

export default async function InteligenciaArtificialPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/inteligencia-artificial");
  }

  const role = session.user.role;
  const isAdmin = role === "owner" || role === "admin";
  if (!isAdmin) {
    redirect("/opai/configuracion");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Inteligencia Artificial"
      description="Configura el proveedor de IA, API key y modelo para las funciones inteligentes de OPAI"
      icon={Sparkles}
    >
      <AiProvidersConfigClient />
    </ConfigPageLayout>
  );
}
