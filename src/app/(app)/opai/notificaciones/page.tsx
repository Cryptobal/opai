import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHero } from "@/components/opai-ds";
import { Bell, Settings2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NotificationListClient } from "@/components/opai/NotificationListClient";

export const metadata = {
  title: "Notificaciones - OPAI",
  description: "Todas tus notificaciones",
};

export default async function NotificacionesPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/notificaciones");

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Bell />}
        iconTone="primary"
        title="Notificaciones"
        subtitle="todas tus notificaciones recientes"
        description="Filtra por módulo, marca como leídas o silencia tipos que no quieras recibir."
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/opai/perfil/notificaciones">
              <Settings2 className="h-4 w-4" />
              Configurar
            </Link>
          </Button>
        }
      />
      <NotificationListClient />
    </div>
  );
}
