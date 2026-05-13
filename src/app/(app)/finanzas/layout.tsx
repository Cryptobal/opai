import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePagePerms, hasModuleAccess } from "@/lib/permissions-server";
import { ModuleSubNav } from "@/components/opai-ds";

export default async function FinanzasLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  return (
    <div className="space-y-3 min-w-0">
      {/* N2 row de Finanzas: Inicio / Rendic. / C/V / Banca / Contab. / Informes.
          Se muestra SIEMPRE arriba del Hero — el N3 (si existe) lo monta cada
          page debajo del Hero para que el orden sea breadcrumb → N2 → Hero
          → N3 → contenido. */}
      <ModuleSubNav moduleKey="finance" disableAutoSuppress />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
