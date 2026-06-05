import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canEdit, hasCapability } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { PlusCircle } from "lucide-react";
import { SupervisionVisitWizard } from "@/components/supervision/wizard";

export default async function NuevaVisitaSupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ continuar?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/nueva-visita");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canEdit(perms, "ops", "supervision") || !hasCapability(perms, "supervision_checkin")) {
    redirect("/ops/supervision");
  }

  const { continuar } = await searchParams;
  const isResuming = Boolean(continuar);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <PageHero
        icon={<PlusCircle />}
        iconTone="emerald"
        title={isResuming ? "Continuar visita de supervisión" : "Nueva visita de supervisión"}
        subtitle={isResuming ? "retomar donde quedaste" : "wizard de 5 pasos"}
        description={
          isResuming
            ? "Retoma la visita en progreso en el paso donde la dejaste y ciérrala cuando termines."
            : "Wizard de 5 pasos: Check-in geolocalizado, Evaluación, Verificación con checklist, Evidencia fotográfica y Cierre con firma."
        }
      />
      <SupervisionVisitWizard resumeVisitId={continuar} />
    </div>
  );
}
