import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canDelete, canView, resolvePagePerms } from "@/lib/permissions-server";
import { InventarioConfigClient } from "@/components/inventario/InventarioConfigClient";

export default async function InventarioConfiguracionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/configuracion");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const allowDelete = canDelete(perms, "ops", "inventario");

  return (
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-4">
        <InventarioConfigClient canDelete={allowDelete} />
      </section>
    </div>
  );
}
