import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { TicketDetailClient } from "@/components/ops/tickets";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";
import { prisma } from "@/lib/prisma";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/ops/tickets/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops")) {
    redirect("/hub");
  }

  const memberships = await prisma.adminGroupMembership.findMany({
    where: { adminId: session.user.id },
    select: { groupId: true },
  });
  const userGroupIds = memberships.map((m) => m.groupId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detalle de ticket"
        description="Seguimiento, comentarios y gestión del ticket."
      />
      <OpsGlobalSearch className="w-full sm:max-w-xs" />
      <TicketDetailClient
        ticketId={id}
        userRole={session.user.role}
        userId={session.user.id}
        userGroupIds={userGroupIds}
      />
    </div>
  );
}
