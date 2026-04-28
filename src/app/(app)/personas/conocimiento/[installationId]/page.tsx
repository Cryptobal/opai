import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DetalleClient } from "./DetalleClient";

export const metadata = { title: "Conocimiento — Instalación" };

export default async function PersonasConocimientoDetallePage({
  params,
}: {
  params: Promise<{ installationId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/conocimiento");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "guardias")) {
    redirect("/hub");
  }
  const { installationId } = await params;
  return <DetalleClient installationId={installationId} />;
}
