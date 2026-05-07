import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { canDelete, canView, resolvePagePerms } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
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
      <section className="relative w-full pb-32 space-y-6">
        <PageHero
          icon={<Settings2 />}
          iconTone="emerald"
          eyebrow={["Operaciones", "Inventario", "Configuración"]}
          title="Configuración"
          subtitle="bodegas y auditoría del módulo"
          description="Gestiona bodegas y revisa el historial de cambios. Toda acción del módulo queda registrada con autor, IP y detalle."
        />
        <InventarioConfigClient canDelete={allowDelete} />
      </section>
    </div>
  );
}
