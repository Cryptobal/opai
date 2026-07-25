import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import ComunicacionesPageClient from "@/components/comunicaciones/ComunicacionesPageClient";

export default async function ComunicacionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/comunicaciones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <ComunicacionesPageClient tenantId={tenantId} />
    </div>
  );
}
