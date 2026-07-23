import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { Spinner } from "@/components/opai-ds";
import { AgendaPageClient } from "@/components/agenda/AgendaPageClient";

export default async function AgendaPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/agenda");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "deals")) {
    redirect("/hub");
  }

  // La Agenda vive fuera del layout de /crm pero la barra superior la resuelve
  // al módulo Comercial (activePaths en el registry), así los tabs se mantienen.
  return (
    <div className="space-y-3 min-w-0">
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        }
      >
        <AgendaPageClient />
      </Suspense>
    </div>
  );
}
