import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canEdit, hasCapability } from "@/lib/permissions-server";
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

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <SupervisionVisitWizard resumeVisitId={continuar} />
    </div>
  );
}
