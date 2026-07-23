import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";

export default async function FlujoCajaLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");
  // Tabs de Banca en la barra superior (AppShell); layout solo con guard.
  // sheet-focus-flat: ver AppShell — en el modo hoja móvil de la planilla se
  // anulan los espaciadores; las demás páginas de flujo-caja no cambian.
  return <div className="min-w-0 sheet-focus-flat">{children}</div>;
}
