import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canDelete } from "@/lib/permissions-server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/opai";
import { InventarioBodegasManager } from "@/components/inventario/InventarioBodegasManager";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

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
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Bodegas"
        description="Bodegas virtuales: central, supervisores, instalaciones."
      />
      <InventarioSubnav />
      <Card>
        <CardContent className="p-3 sm:p-4">
          <InventarioBodegasManager canDelete={allowDelete} />
        </CardContent>
      </Card>
    </div>
  );
}
