import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { InventarioEntregasClient } from "@/components/inventario/InventarioEntregasClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

export default async function InventarioEntregasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/entregas");
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
          icon={<Truck />}
          iconTone="emerald"
          eyebrow={["Operaciones", "Inventario", "Entregas"]}
          title="Entregas a guardias"
          subtitle="trazabilidad y firma de recepción"
          description="Cada entrega descuenta stock de la bodega y queda asociada al guardia y la instalación. El portal del guardia recibe push para confirmar."
        />
        <InventarioEntregasClient currentUserId={session.user.id} canEdit={allowEdit} />
      </section>
    </div>
  );
}
