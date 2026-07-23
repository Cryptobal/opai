import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canDelete } from "@/lib/permissions-server";
import { Surface } from "@/components/opai-ds";
import { InventarioBodegasManager } from "@/components/inventario/InventarioBodegasManager";

export default async function InventarioBodegasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/bodegas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const allowDelete = canDelete(perms, "ops", "inventario");

  return (
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-4">
        <Surface elevation={1} padding="md">
          <InventarioBodegasManager canDelete={allowDelete} />
        </Surface>
      </section>
    </div>
  );
}
