import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { InventarioEntregasClient } from "@/components/inventario/InventarioEntregasClient";

export default async function InventarioEntregasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/entregas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Entregas a guardias"
        description="Registrar entrega de uniformes a un guardia. Descuenta stock de la bodega."
        backHref="/ops/inventario"
        backLabel="Inventario"
      />
      <InventarioEntregasClient />
    </div>
  );
}
