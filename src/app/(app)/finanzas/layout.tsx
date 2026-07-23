import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";

export default async function FinanzasLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  // La barra superior auto-detecta el N2 de Finanzas (moduleKey="finance");
  // el N3 (cuando existe) sigue como FinanceN3Chips dentro del contenido.
  // sheet-focus-flat: en el modo hoja móvil de la planilla (data-layout-mode
  // en AppShell) estos espaciadores se anulan para que la hoja pegue arriba.
  return (
    <div className="min-w-0 sheet-focus-flat">
      <div className="min-w-0">{children}</div>
    </div>
  );
}
