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
      {/* visibility="always": en mobile la BottomNav no muestra de forma fiable
          los 8 children de C/V (Resumen, Emitidos, Recibidos, Programación,
          Libro IVA, Proveedores, Folios, Cesiones), así que mostramos las
          SwipeTabs scrollables arriba — paridad con Banca. */}
      <ModuleSubNav moduleKey="finance-compras-ventas" visibility="always" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
