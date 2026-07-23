import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { TicketDetailClient } from "@/components/ops/tickets";
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
    <div className="min-w-0">
      <TicketDetailClient
        ticketId={id}
        userRole={session.user.role}
        userId={session.user.id}
        userGroupIds={userGroupIds}
      />
    </div>
  );
}
