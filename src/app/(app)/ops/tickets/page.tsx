import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { TicketCheck } from "lucide-react";
import { TicketsClient } from "@/components/ops/tickets";
import { TicketsSubnav } from "@/components/ops/TicketsSubnav";

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
      <PageHero
        icon={<TicketCheck />}
        iconTone="emerald"
        eyebrow={["Operaciones", "Tickets"]}
        title="Tickets"
        subtitle="incidencias y requerimientos"
        description="Seguimiento de solicitudes, incidentes y requerimientos internos con SLA, prioridades y workflow de aprobación."
      />
      <TicketsSubnav />
      <Suspense>
        <TicketsClient userRole={session.user.role} userId={session.user.id} />
      </Suspense>
    </div>
  );
}
