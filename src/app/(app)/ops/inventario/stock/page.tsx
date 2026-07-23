import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { Spinner } from "@/components/opai-ds";
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

  const allowEdit = canEdit(perms, "ops", "inventario");

  return (
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-4">
        <Suspense fallback={<Spinner block label="Cargando stock…" />}>
          <InventarioStockClient canEdit={allowEdit} />
        </Suspense>
      </section>
    </div>
  );
}
