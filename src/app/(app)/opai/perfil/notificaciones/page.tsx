import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DetailHeader } from "@/components/opai-ds";
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
    <div className="space-y-4 min-w-0">
      <DetailHeader
        title="Mis Notificaciones"
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
