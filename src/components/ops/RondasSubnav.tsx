"use client";

import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import {
  ClipboardList,
  Radio,
  Bell,
  Settings,
  BarChart3,
  Brain,
} from "lucide-react";

const RONDAS_ITEMS: SubNavItem[] = [
  { href: "/ops/rondas", label: "Dashboard", icon: ClipboardList, exactMatch: true },
  { href: "/ops/rondas/monitoreo", label: "Monitor", icon: Radio },
  { href: "/ops/rondas/alertas", label: "Alertas", icon: Bell },
  { href: "/ops/rondas/configuracion", label: "Configuración", icon: Settings },
  { href: "/ops/rondas/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/ops/rondas/centro-ia", label: "Centro IA", icon: Brain },
];

export function RondasSubnav() {
  return <SubNav items={RONDAS_ITEMS} />;
}
