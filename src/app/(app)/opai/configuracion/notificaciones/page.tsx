import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { NotificationConfigClient } from "@/components/opai/NotificationConfigClient";
import { Bell } from "lucide-react";

export default async function NotificacionesConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion/notificaciones");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "notificaciones")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Notificaciones"
      description="Parámetros globales. Cada usuario configura sus preferencias en Perfil → Mis notificaciones"
      icon={<Bell className="h-[18px] w-[18px]" />}
    >
      <NotificationConfigClient />
    </ConfigPageLayout>
  );
}
