import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
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
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Productos"
        description="Catálogo de uniformes y activos. Define tallas por producto."
      />
      <InventarioSubnav />
      <InventarioProductosClient />
    </div>
  );
}
