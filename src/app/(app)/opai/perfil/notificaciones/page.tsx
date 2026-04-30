import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai-ds";
import { UnifiedNotificationPrefsClient } from "@/components/opai/UnifiedNotificationPrefsClient";
import { QuietHoursCard } from "@/components/opai/QuietHoursCard";

export const metadata = {
  title: "Mis Notificaciones - OPAI",
  description: "Configura tus preferencias de notificaciones",
};

interface Props {
  searchParams: Promise<{ type?: string }>;
}

export default async function MisNotificacionesPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/perfil/notificaciones");

  const params = await searchParams;

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Mis Notificaciones"
        description="Configura qué notificaciones recibes por campana, email y push"
        backHref="/opai/perfil"
        backLabel="Mi Perfil"
      />
      <QuietHoursCard />
      <UnifiedNotificationPrefsClient highlightType={params.type} />
    </div>
  );
}
