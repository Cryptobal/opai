import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Card, CardContent } from "@/components/ui/card";
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

  const modules = [
    {
      href: "/ops/inventario/productos",
      title: "Productos",
      description: "Catálogo de uniformes y activos con tallas configurables.",
      icon: Shirt,
      color: "text-blue-400 bg-blue-400/10",
    },
    {
      href: "/ops/inventario/bodegas",
      title: "Bodegas",
      description: "Bodegas virtuales: central, supervisores, instalaciones.",
      icon: Warehouse,
      color: "text-amber-400 bg-amber-400/10",
    },
    {
      href: "/ops/inventario/compras",
      title: "Compras",
      description: "Registrar ingresos de uniformes y activos.",
      icon: ShoppingCart,
      color: "text-emerald-400 bg-emerald-400/10",
    },
    {
      href: "/ops/inventario/entregas",
      title: "Entregas",
      description: "Entregar uniformes a guardias. Trazabilidad por guardia e instalación.",
      icon: UserRoundCheck,
      color: "text-violet-400 bg-violet-400/10",
    },
    {
      href: "/ops/inventario/stock",
      title: "Stock",
      description: "Stock por bodega y variante.",
      icon: Layers,
      color: "text-purple-400 bg-purple-400/10",
    },
    {
      href: "/ops/inventario/activos",
      title: "Activos",
      description: "Celulares, radios y asignación a instalaciones.",
      icon: Smartphone,
      color: "text-cyan-400 bg-cyan-400/10",
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
          <Link key={m.href} href={m.href}>
            <Card className="transition-colors hover:bg-accent/40 h-full">
              <CardContent className="pt-5 flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${m.color}`}
                >
                  <m.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{m.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
