import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canDelete, canView } from "@/lib/permissions-server";
import { resolvePagePerms } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";
import { InventarioConfigClient } from "@/components/inventario/InventarioConfigClient";

export default async function InventarioConfiguracionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/configuracion");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const allowDelete = canDelete(perms, "ops", "inventario");

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Configuración de Inventario"
        description="Gestiona bodegas y revisa el historial de cambios del módulo."
        backHref="/ops/inventario"
        backLabel="Inventario"
      />
      <InventarioSubnav />
      <InventarioConfigClient canDelete={allowDelete} />
    </div>
  );
}
