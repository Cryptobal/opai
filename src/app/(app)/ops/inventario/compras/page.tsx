import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { OpaiPageHero } from "@/components/opai";
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
    <div className="min-w-0">
      <InventarioSubnav />
      <section className="relative w-full pb-32 space-y-5">
        <OpaiPageHero
          eyebrow={["Operaciones", "Inventario", "Compras"]}
          title="Ingresos de inventario"
          subtitle="compras y abastecimiento"
          description="Registra cada ingreso a bodega. El stock se actualiza con costo promedio ponderado y queda asociable a futuras facturas."
        />
        <InventarioComprasClient />
      </section>
    </div>
  );
}
