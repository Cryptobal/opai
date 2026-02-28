import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { ExamenesListClient } from "@/components/ops/exams/ExamenesListClient";

export default async function OpsExamenesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/examenes");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Exámenes"
        description="Evaluaciones de protocolo y seguridad general para guardias."
      />
      <ExamenesListClient />
    </div>
  );
}
