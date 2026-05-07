import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { InventarioOverviewClient } from "@/components/inventario/InventarioOverviewClient";

export default async function InventarioPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const allowEdit = canEdit(perms, "ops", "inventario");

  return (
    <div className="min-w-0">
      <InventarioOverviewClient canEdit={allowEdit} />
    </div>
  );
}
