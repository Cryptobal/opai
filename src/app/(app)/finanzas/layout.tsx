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
      {/* Auto-suppressed when a more specific child layout (facturacion, reportes)
          owns the active route — see ModuleSubNav#shouldSuppress. */}
      <ModuleSubNav moduleKey="finance" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
