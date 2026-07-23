import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { TicketsClient } from "@/components/ops/tickets";

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
    <div className="min-w-0">
      <Suspense>
        <TicketsClient userRole={session.user.role} userId={session.user.id} />
      </Suspense>
    </div>
  );
}
