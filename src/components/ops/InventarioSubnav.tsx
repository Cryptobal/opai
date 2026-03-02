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
} from "lucide-react";

const INVENTARIO_ITEMS: SubNavItem[] = [
  { href: "/ops/inventario", label: "Inicio", icon: Package, exactMatch: true },
  { href: "/ops/inventario/productos", label: "Productos", icon: Shirt },
  { href: "/ops/inventario/bodegas", label: "Bodegas", icon: Warehouse },
  { href: "/ops/inventario/compras", label: "Compras", icon: ShoppingCart },
  { href: "/ops/inventario/entregas", label: "Entregas", icon: UserRoundCheck },
  { href: "/ops/inventario/stock", label: "Stock", icon: Layers },
  { href: "/ops/inventario/activos", label: "Activos", icon: Smartphone },
];

export function InventarioSubnav() {
  return <SubNav items={INVENTARIO_ITEMS} />;
}
