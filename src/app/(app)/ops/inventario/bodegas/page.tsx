import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canDelete } from "@/lib/permissions-server";
import { OpaiPageHero } from "@/components/opai";
import { InventarioBodegasManager } from "@/components/inventario/InventarioBodegasManager";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

export default async function InventarioBodegasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/bodegas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const allowDelete = canDelete(perms, "ops", "inventario");

  return (
    <div className="min-w-0">
      <InventarioSubnav />
      <section className="relative w-full pb-32 space-y-5">
        <OpaiPageHero
          eyebrow={["Operaciones", "Inventario", "Bodegas"]}
          title="Bodegas virtuales"
          subtitle="central, supervisores e instalaciones"
          description="Cada bodega almacena stock independiente. Mueve unidades entre ellas con auditoría completa."
        />
        <div className="card-mock p-3 sm:p-4">
          <InventarioBodegasManager canDelete={allowDelete} />
        </div>
      </section>
    </div>
  );
}
