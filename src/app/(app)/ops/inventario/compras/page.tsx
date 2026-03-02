import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { InventarioComprasClient } from "@/components/inventario/InventarioComprasClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

export default async function InventarioComprasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/compras");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Compras"
        description="Registrar ingresos de uniformes y activos. Asocia a factura más adelante."
      />
      <InventarioSubnav />
      <InventarioComprasClient />
    </div>
  );
}
