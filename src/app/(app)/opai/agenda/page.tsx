import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { Spinner, ModuleSubNav } from "@/components/opai-ds";
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

  // La Agenda vive fuera del layout de /crm; montamos la subnav de CRM para no
  // perder los tabs (Leads, Negocios, Correos, …) al entrar acá.
  return (
    <div className="space-y-3 min-w-0">
      <ModuleSubNav moduleKey="crm" />
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
