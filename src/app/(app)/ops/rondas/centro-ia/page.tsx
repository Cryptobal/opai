import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { Sparkles } from "lucide-react";
import { RondasCentroIaClient } from "@/components/ops/rondas/RondasCentroIaClient";

export default async function RondasCentroIaPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/centro-ia");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Sparkles />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Centro IA"]}
        title="Centro de Inteligencia Artificial"
        subtitle="anomalías y predicciones"
        description="Detección automática de patrones anómalos, recomendaciones operativas y configuración de umbrales para el sistema de IA."
      />
      <RondasCentroIaClient />
    </div>
  );
}
