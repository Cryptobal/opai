import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { PageHero, Spinner } from "@/components/opai-ds";
import { InventarioStockClient } from "@/components/inventario/InventarioStockClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

export default async function InventarioStockPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/stock");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const allowEdit = canEdit(perms, "ops", "inventario");

  return (
    <div className="min-w-0">
      <InventarioSubnav />
      <section className="relative w-full pb-32 space-y-6">
        <PageHero
          icon={Layers}
          iconTone="emerald"
          eyebrow={["Operaciones", "Inventario", "Stock"]}
          title="Stock por bodega"
          subtitle="niveles y alertas"
          description="Vista consolidada del inventario con costo promedio. Alertas automáticas cuando un ítem cae bajo el mínimo."
        />
        <Suspense fallback={<Spinner block label="Cargando stock…" />}>
          <InventarioStockClient canEdit={allowEdit} />
        </Suspense>
      </section>
    </div>
  );
}
