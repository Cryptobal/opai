import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHero } from "@/components/opai-ds";
import { Bell } from "lucide-react";
import { UnifiedNotificationPrefsClient } from "@/components/opai/UnifiedNotificationPrefsClient";
import { QuietHoursCard } from "@/components/opai/QuietHoursCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = {
  title: "Mis Notificaciones - OPAI",
  description: "Configura tus preferencias de notificaciones",
};

interface Props {
  searchParams: Promise<{ type?: string; tab?: string }>;
}

export default async function MisNotificacionesPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/perfil/notificaciones");

  const params = await searchParams;
  const defaultTab = params.tab === "quiet" ? "quiet" : "prefs";

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Bell />}
        iconTone="primary"
        eyebrow={["Mi Perfil", "Notificaciones"]}
        title="Mis Notificaciones"
        subtitle="campana, email y push (escritorio + móvil)"
        description="Activa o desactiva cada tipo, módulo a módulo. Los cambios aplican solo a ti."
        backHref="/opai/perfil"
        backLabel="Mi Perfil"
      />

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          <TabsTrigger value="prefs">Mis preferencias</TabsTrigger>
          <TabsTrigger value="quiet">No molestar</TabsTrigger>
        </TabsList>
        <TabsContent value="prefs" className="mt-4">
          <UnifiedNotificationPrefsClient highlightType={params.type} />
        </TabsContent>
        <TabsContent value="quiet" className="mt-4">
          <QuietHoursCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
