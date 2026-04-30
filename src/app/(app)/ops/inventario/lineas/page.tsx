import { redirect } from "next/navigation";
import { Phone } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { InventarioLineasClient } from "@/components/inventario/InventarioLineasClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

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
      <InventarioSubnav />
      <section className="relative w-full pb-32 space-y-6">
        <PageHero
          icon={Phone}
          iconTone="emerald"
          eyebrow={["Operaciones", "Inventario", "Líneas"]}
          title="Líneas telefónicas"
          subtitle="SIM cards y números corporativos"
          description="Gestiona los números asignados a guardias, supervisores e instalaciones. Historial completo de movimientos."
        />
        <InventarioLineasClient />
      </section>
    </div>
  );
}
