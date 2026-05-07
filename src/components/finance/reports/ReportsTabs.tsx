"use client";

import {
  LayoutDashboard,
  FileBarChart,
  Scale,
  Grid3x3,
  TrendingUp,
  BookOpen,
  Receipt,
} from "lucide-react";
import { SubNav, type SubNavItem } from "@/components/opai-ds/SubNav";

const ITEMS: SubNavItem[] = [
  { href: "/finanzas/reportes", label: "Dashboard", icon: LayoutDashboard, exactMatch: true },
  { href: "/finanzas/reportes/eerr", label: "Estado de Resultado", icon: FileBarChart },
  { href: "/finanzas/reportes/balance", label: "Balance General", icon: Scale },
  { href: "/finanzas/reportes/ventas", label: "Ventas por cliente", icon: Grid3x3 },
  { href: "/finanzas/reportes/compras", label: "Compras", icon: Receipt },
  { href: "/finanzas/reportes/rentabilidad", label: "Rentabilidad", icon: TrendingUp },
  { href: "/finanzas/reportes/mayor", label: "Libro Mayor", icon: BookOpen },
];

export function ReportsTabs() {
  return <SubNav items={ITEMS} />;
}
