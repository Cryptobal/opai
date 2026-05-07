import { redirect } from "next/navigation";
import { Smartphone } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
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
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-6">
        <PageHero
          icon={<Smartphone />}
          iconTone="emerald"
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
