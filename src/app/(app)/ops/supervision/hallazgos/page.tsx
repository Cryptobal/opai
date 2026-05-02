import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { AlertCircle } from "lucide-react";
import { SupervisionHallazgos } from "@/components/supervision/SupervisionHallazgos";
export default async function HallazgosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/hallazgos");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-4 min-w-0">
      <PageHero
        icon={<AlertCircle />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Supervisión", "Hallazgos"]}
        title="Hallazgos"
        subtitle="gestión de incidencias"
        description="Lista de hallazgos detectados durante visitas de supervisión, con seguimiento, asignación a tickets y resolución."
      />
      <SupervisionHallazgos />
    </div>
  );
}
