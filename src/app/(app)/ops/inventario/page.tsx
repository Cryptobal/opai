import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader, ModuleCard } from "@/components/opai";
import { InventarioKpisCard } from "@/components/inventario/InventarioKpisCard";
import {
  Warehouse,
  ShoppingCart,
  Layers,
  Smartphone,
  Shirt,
  UserRoundCheck,
} from "lucide-react";

export default async function InventarioPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const modules: {
    href: string;
    title: string;
    description: string;
    icon: typeof Shirt;
  }[] = [
    {
      href: "/ops/inventario/productos",
      title: "Productos",
      description: "Catálogo de uniformes y activos con tallas configurables.",
      icon: Shirt,
    },
    {
      href: "/ops/inventario/bodegas",
      title: "Bodegas",
      description: "Bodegas virtuales: central, supervisores, instalaciones.",
      icon: Warehouse,
    },
    {
      href: "/ops/inventario/compras",
      title: "Compras",
      description: "Registrar ingresos de uniformes y activos.",
      icon: ShoppingCart,
    },
    {
      href: "/ops/inventario/entregas",
      title: "Entregas",
      description: "Entregar uniformes a guardias. Trazabilidad por guardia e instalación.",
      icon: UserRoundCheck,
    },
    {
      href: "/ops/inventario/stock",
      title: "Stock",
      description: "Stock por bodega y variante.",
      icon: Layers,
    },
    {
      href: "/ops/inventario/activos",
      title: "Activos",
      description: "Celulares, radios y asignación a instalaciones.",
      icon: Smartphone,
    },
  ];

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Inventario"
        description="Gestión de uniformes, activos y teléfonos por instalación."
        backHref="/hub"
        backLabel="Inicio"
      />

      <InventarioKpisCard />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-w-0">
        {modules.map((m) => (
          <ModuleCard
            key={m.href}
            title={m.title}
            description={m.description}
            icon={m.icon}
            href={m.href}
          />
        ))}
      </div>
    </div>
  );
}
