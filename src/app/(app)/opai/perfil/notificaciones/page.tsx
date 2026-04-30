import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai-ds";
import { UserNotificationPrefsClient } from "@/components/opai/UserNotificationPrefsClient";

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
        description="Configura qué notificaciones recibes por campana y por correo electrónico"
        backHref="/opai/perfil"
        backLabel="Mi Perfil"
      />
      <UserNotificationPrefsClient highlightType={params.type} />
    </div>
  );
}
