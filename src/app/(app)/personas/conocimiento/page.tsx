import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { ConocimientoClient } from "./ConocimientoClient";

export const metadata = {
  title: "Conocimiento",
};

export default async function PersonasConocimientoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/conocimiento");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }
  return <ConocimientoClient />;
}
