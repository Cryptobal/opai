import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { NotificationListClient } from "@/components/opai/NotificationListClient";

export const metadata = {
  title: "Notificaciones - OPAI",
  description: "Tus notificaciones",
};

export default async function NotificacionesPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/notificaciones");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificaciones"
        description="Todas tus notificaciones con enlaces directos"
      />
      <NotificationListClient />
    </div>
  );
}
