import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { NotificationConfigClient } from "@/components/opai/NotificationConfigClient";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";

export default async function NotificacionesConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Notificaciones"
        description="Parámetros globales. Cada usuario configura sus preferencias en Perfil → Mis notificaciones"
      />
      <NotificationConfigClient />
    </div>
  );
}
