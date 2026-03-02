"use client";

import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import { usePermissions } from "@/lib/permissions-context";
import { canView, hasCapability, type RolePermissions } from "@/lib/permissions";
import {
  LayoutDashboard,
  Receipt,
  CheckCircle2,
  Wallet,
  BarChart3,
  FileText,
  Building2,
  Landmark,
  BookText,
} from "lucide-react";

const FINANCE_ITEMS: (SubNavItem & {
  subKey?: string;
  capability?: string;
})[] = [
  { href: "/finanzas", label: "Inicio", icon: LayoutDashboard, exactMatch: true },
  { href: "/finanzas/rendiciones", label: "Rendiciones", icon: Receipt, subKey: "rendiciones" },
  { href: "/finanzas/aprobaciones", label: "Aprobaciones", icon: CheckCircle2, subKey: "aprobaciones", capability: "rendicion_approve" },
  { href: "/finanzas/pagos", label: "Pagos", icon: Wallet, subKey: "pagos", capability: "rendicion_pay" },
  { href: "/finanzas/facturacion", label: "Ventas", icon: FileText, subKey: "facturacion" },
  { href: "/finanzas/proveedores", label: "Compras", icon: Building2, subKey: "proveedores" },
  { href: "/finanzas/bancos", label: "Banca", icon: Landmark, subKey: "contabilidad" },
  { href: "/finanzas/contabilidad", label: "Contabilidad", icon: BookText, subKey: "contabilidad" },
  { href: "/finanzas/reportes", label: "Informes", icon: BarChart3, subKey: "reportes" },
];

function filterByPermissions(perms: RolePermissions) {
  return FINANCE_ITEMS.filter((item) => {
    if (!item.subKey) return true;
    if (!canView(perms, "finance", item.subKey)) return false;
    if (item.capability && !hasCapability(perms, item.capability)) return false;
    return true;
  });
}

export function FinanceSubnav() {
  const permissions = usePermissions();
  const visibleItems = filterByPermissions(permissions);
  return <SubNav items={visibleItems} />;
}
