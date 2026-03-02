import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { RondasCentroIaClient } from "@/components/ops/rondas/RondasCentroIaClient";

export default async function RondasCentroIaPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/centro-ia");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Centro de Inteligencia Artificial"
        description="Detección de anomalías, recomendaciones y análisis predictivo."
      />
      <RondasCentroIaClient />
    </div>
  );
}
