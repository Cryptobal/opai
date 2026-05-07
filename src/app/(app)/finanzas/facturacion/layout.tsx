import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
} from "@/lib/permissions-server";
import { ModuleSubNav } from "@/components/opai-ds";

export default async function FacturacionLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/facturacion");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "facturacion")) {
    redirect("/finanzas");
  }
  return (
    <div className="space-y-3 min-w-0">
      <ModuleSubNav moduleKey="finance-ventas" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
