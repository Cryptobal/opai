import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { InventarioStockClient } from "@/components/inventario/InventarioStockClient";

export default async function InventarioStockPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/stock");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        description="Stock actual por bodega y variante."
        backHref="/ops/inventario"
        backLabel="Inventario"
      />
      <InventarioStockClient />
    </div>
  );
}
