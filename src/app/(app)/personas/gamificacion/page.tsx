import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { GamificacionAdminClient } from "./GamificacionAdminClient";

export default async function GamificacionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/gamificacion");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "gamificacion")) {
    redirect("/personas/guardias");
  }

  return <GamificacionAdminClient />;
}
