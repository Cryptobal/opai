import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHero } from "@/components/opai-ds";
import { Activity } from "lucide-react";
import { ActivityFeedClient } from "@/components/opai/ActivityFeedClient";

export const metadata = {
  title: "Actividad - OPAI",
  description: "Feed de actividad de notas",
};

export default async function ActividadPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/actividad");

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Activity />}
        iconTone="primary"
        eyebrow={["Mi Perfil", "Actividad"]}
        title="Actividad"
        subtitle="historial reciente"
        description="Notas y menciones de las entidades que sigues"
      />
      <ActivityFeedClient currentUserId={session.user.id} />
    </div>
  );
}
