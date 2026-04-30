import { redirect } from "next/navigation";
import { Warehouse } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canDelete } from "@/lib/permissions-server";
import { PageHero, Surface } from "@/components/opai-ds";
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
      <section className="relative w-full pb-32 space-y-6">
        <PageHero
          icon={<Warehouse />}
          iconTone="emerald"
          eyebrow={["Operaciones", "Inventario", "Bodegas"]}
          title="Bodegas virtuales"
          subtitle="central, supervisores e instalaciones"
          description="Cada bodega almacena stock independiente. Mueve unidades entre ellas con auditoría completa."
        />
        <Surface elevation={1} padding="md">
          <InventarioBodegasManager canDelete={allowDelete} />
        </Surface>
      </section>
    </div>
  );
}
