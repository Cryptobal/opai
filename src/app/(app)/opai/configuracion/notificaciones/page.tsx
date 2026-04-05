import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { NotificationConfigClient } from "@/components/opai/NotificationConfigClient";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { Bell } from "lucide-react";

export default async function NotificacionesConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (!hasPermission(role as Role, PERMISSIONS.MANAGE_SETTINGS)) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Notificaciones"
      description="Parámetros globales. Cada usuario configura sus preferencias en Perfil → Mis notificaciones"
      icon={Bell}
    >
      <NotificationConfigClient />
    </ConfigPageLayout>
  );
}
