"use client";

import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import { usePermissions } from "@/lib/permissions-context";
import { getVisibleSubmodules } from "@/lib/permissions";
import {
  Users,
  Plug,
  PenLine,
  FolderTree,
  TrendingUp,
  DollarSign,
  Calculator,
  Bell,
  ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Mapeo de config submodule key → icono */
const CONFIG_ICONS: Record<string, LucideIcon> = {
  usuarios: Users,
  integraciones: Plug,
  firmas: PenLine,
  categorias: FolderTree,
  crm: TrendingUp,
  cpq: DollarSign,
  payroll: Calculator,
  notificaciones: Bell,
  ops: ClipboardList,
};

export function ConfigSubnav({ role }: { role: string }) {
  const permissions = usePermissions();
  const visibleSubs = getVisibleSubmodules(permissions, "config");

  const items: SubNavItem[] = visibleSubs.map((sub) => ({
    href: sub.href,
    label: sub.label,
    icon: CONFIG_ICONS[sub.submodule] ?? undefined,
  }));

  return <SubNav items={items} />;
}
