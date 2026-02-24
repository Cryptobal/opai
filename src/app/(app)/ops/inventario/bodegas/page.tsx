import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { InventarioBodegasClient } from "@/components/inventario/InventarioBodegasClient";

export default async function InventarioBodegasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/bodegas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Bodegas"
        description="Bodegas virtuales: central, supervisores, instalaciones."
        backHref="/ops/inventario"
        backLabel="Inventario"
      />
      <InventarioBodegasClient />
    </div>
  );
}
