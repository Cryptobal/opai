import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";

export default async function RendicionesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/rendiciones");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  // El N2 lo monta /finanzas/layout. El N3 (Lista / Pagos) lo monta cada
  // page DEBAJO del PageHero para mantener el orden estándar:
  //   breadcrumb → N2 → Hero → N3 → contenido.
  return <div className="min-w-0">{children}</div>;
}
