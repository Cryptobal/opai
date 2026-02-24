import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { TicketsClient } from "@/components/ops/tickets";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";

export default async function OpsTicketsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/tickets");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Tickets"
        description="Seguimiento de solicitudes, incidentes y requerimientos internos con SLA y prioridades."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <Suspense>
        <TicketsClient userRole={session.user.role} />
      </Suspense>
    </div>
  );
}
