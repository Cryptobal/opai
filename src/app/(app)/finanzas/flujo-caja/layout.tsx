import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { ModuleSubNav } from "@/components/opai-ds";

export default async function FlujoCajaLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/flujo-caja");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");
  return (
    // sheet-focus-flat: ver AppShell — en el modo hoja móvil de la planilla se
    // anulan los espaciadores; las demás páginas de flujo-caja no cambian.
    <div className="space-y-4 min-w-0 sheet-focus-flat">
      <ModuleSubNav moduleKey="finance-banca" />
      {children}
    </div>
  );
}
