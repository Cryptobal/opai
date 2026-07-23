import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { InventarioComprasClient } from "@/components/inventario/InventarioComprasClient";

export default async function InventarioComprasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/compras");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-4">
        <InventarioComprasClient />
      </section>
    </div>
  );
}
