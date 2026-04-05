import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { GamificacionConfigClient } from "./GamificacionConfigClient";
import { Trophy } from "lucide-react";

export default async function GamificacionConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/gamificacion");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "gamificacion")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Gamificación"
      description="Parámetros del Trust Score, pesos y configuración general"
      icon={Trophy}
    >
      <GamificacionConfigClient />
    </ConfigPageLayout>
  );
}
