import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
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
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Stock"
        description="Stock actual por bodega y variante."
      />
      <InventarioSubnav />
      <Suspense fallback={<p className="text-sm sm:text-base text-muted-foreground">Cargando stock…</p>}>
        <InventarioStockClient canEdit={allowEdit} />
      </Suspense>
    </div>
  );
}
