import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { InventarioLineasClient } from "@/components/inventario/InventarioLineasClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

export default async function InventarioLineasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/lineas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Líneas Telefónicas"
        description="Gestión de líneas SIM y números telefónicos. Asignación a instalaciones e historial."
      />
      <InventarioSubnav />
      <InventarioLineasClient />
    </div>
  );
}
