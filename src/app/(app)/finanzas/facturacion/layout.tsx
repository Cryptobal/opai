import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
} from "@/lib/permissions-server";

export default async function FacturacionLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/facturacion");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "facturacion")) {
    redirect("/finanzas");
  }
  // SubNav (SwipeTabs de C/V) lo monta cada página DEBAJO del PageHero —
  // así en mobile y desktop el orden queda breadcrumbs → hero → tabs →
  // contenido, igual que el resto del sitio.
  return <div className="min-w-0">{children}</div>;
}
