import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { OpaiPageHero } from "@/components/opai";
import { InventarioProductosClient } from "@/components/inventario/InventarioProductosClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

export default async function InventarioProductosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/productos");
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
          eyebrow={["Operaciones", "Inventario", "Productos"]}
          title="Catálogo de productos"
          subtitle="uniformes, activos y tallas"
          description="Define los productos disponibles para entregas y compras. Cada producto puede tener múltiples tallas y variantes."
        />
        <InventarioProductosClient />
      </section>
    </div>
  );
}
