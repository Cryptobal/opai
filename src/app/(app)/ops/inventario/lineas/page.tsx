import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { InventarioLineasClient } from "@/components/inventario/InventarioLineasClient";

export default async function InventarioLineasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/lineas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-4">
        <InventarioLineasClient />
      </section>
    </div>
  );
}
