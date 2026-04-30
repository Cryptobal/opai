import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { InventarioActivosClient } from "@/components/inventario/InventarioActivosClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

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
    <div className="min-w-0">
      <InventarioSubnav />
      <section className="relative w-full pb-32 space-y-5">
        <PageHero
          eyebrow={["Operaciones", "Inventario", "Activos"]}
          title="Activos y equipos"
          subtitle="celulares, radios y trazabilidad por instalación"
          description="Asigna activos físicos a instalaciones, controla su estado (disponible, asignado, en mantención) y registra historial."
        />
        <InventarioActivosClient />
      </section>
    </div>
  );
}
