import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ActivityFeedClient } from "@/components/opai/ActivityFeedClient";

export const metadata = {
  title: "Actividad - OPAI",
  description: "Feed de actividad de notas",
};

export default async function ActividadPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/actividad");

  return (
    <div className="min-w-0">
      <ActivityFeedClient currentUserId={session.user.id} />
    </div>
  );
}
