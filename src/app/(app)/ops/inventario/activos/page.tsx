import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { InventarioActivosClient } from "@/components/inventario/InventarioActivosClient";

export default async function InventarioActivosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/activos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Activos"
        description="Celulares, radios y equipos. Asignación a instalaciones y estado."
        backHref="/ops/inventario"
        backLabel="Inventario"
      />
      <InventarioActivosClient />
    </div>
  );
}
