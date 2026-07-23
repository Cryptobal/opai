import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
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

  const allowEdit = canEdit(perms, "ops", "inventario");

  return (
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-4">
        <InventarioEntregasClient currentUserId={session.user.id} canEdit={allowEdit} />
      </section>
    </div>
  );
}
