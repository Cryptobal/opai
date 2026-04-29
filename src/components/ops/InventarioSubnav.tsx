"use client";

import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import {
  Package,
  Shirt,
  Warehouse,
  ShoppingCart,
  UserRoundCheck,
  Layers,
  Smartphone,
  Phone,
  Settings2,
} from "lucide-react";

const INVENTARIO_ITEMS: SubNavItem[] = [
  { href: "/ops/inventario", label: "Inicio", icon: Package, exactMatch: true },
  { href: "/ops/inventario/productos", label: "Productos", icon: Shirt },
  { href: "/ops/inventario/bodegas", label: "Bodegas", icon: Warehouse },
  { href: "/ops/inventario/compras", label: "Compras", icon: ShoppingCart },
  { href: "/ops/inventario/entregas", label: "Entregas", icon: UserRoundCheck },
  { href: "/ops/inventario/stock", label: "Stock", icon: Layers },
  { href: "/ops/inventario/activos", label: "Activos", icon: Smartphone },
  { href: "/ops/inventario/lineas", label: "Líneas", icon: Phone },
  { href: "/ops/inventario/configuracion", label: "Configuración", icon: Settings2 },
];

export function InventarioSubnav() {
  // En mobile el bottom nav global ya muestra los mismos items (módulo Inventario);
  // ocultamos el subnav arriba para evitar duplicación visual.
  return <SubNav items={INVENTARIO_ITEMS} className="hidden lg:block" />;
}
