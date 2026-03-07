import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { GamificacionConfigClient } from "./GamificacionConfigClient";

export default async function GamificacionConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/gamificacion");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "gamificacion")) {
    redirect("/opai/configuracion");
  }

  return <GamificacionConfigClient />;
}
