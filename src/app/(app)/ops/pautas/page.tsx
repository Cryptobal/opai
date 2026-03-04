/**
 * Pautas: entrada al módulo. Redirige a Pauta mensual, donde está el subnav
 * (Mensual, Diaria, Turnos Extra, PPC, Auditoría, etc.).
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function OpsPautasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/pautas");
  }
  const perms = await resolvePagePerms(session.user);
  if (
    !canView(perms, "ops", "pauta_mensual") &&
    !canView(perms, "ops", "pauta_diaria") &&
    !canView(perms, "ops", "turnos_extra") &&
    !canView(perms, "ops", "ppc")
  ) {
    redirect("/hub");
  }
  redirect("/ops/pauta-mensual");
}
