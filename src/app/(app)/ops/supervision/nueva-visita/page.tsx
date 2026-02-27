import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canEdit, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { SupervisionVisitWizard } from "@/components/supervision/wizard";

export default async function NuevaVisitaSupervisionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/nueva-visita");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canEdit(perms, "ops", "supervision") || !hasCapability(perms, "supervision_checkin")) {
    redirect("/ops/supervision");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <PageHeader
        title="Nueva visita de supervisión"
        description="Wizard de 5 pasos: Check-in, Evaluación, Verificación, Evidencia y Cierre."
      />
      <SupervisionVisitWizard />
    </div>
  );
}
