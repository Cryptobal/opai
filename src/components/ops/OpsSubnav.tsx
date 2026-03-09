"use client";

import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import { usePermissions } from "@/lib/permissions-context";
import { canView, type RolePermissions } from "@/lib/permissions";
import {
  LayoutDashboard,
  CalendarDays,
  UserRoundCheck,
  Clock3,
  ShieldAlert,
  Fingerprint,
  Route,
  Ticket,
  Package,
  ClipboardCheck,
  Shield,
} from "lucide-react";

const OPS_ITEMS: (SubNavItem & { subKey?: string })[] = [
  { href: "/ops", label: "Inicio", icon: LayoutDashboard, exactMatch: true },
  // ── Grupo Pautas ──
  { href: "/ops/pauta-mensual", label: "Pauta Mensual", icon: CalendarDays, subKey: "pauta_mensual" },
  { href: "/ops/pauta-diaria", label: "Pauta Diaria", icon: UserRoundCheck, subKey: "pauta_diaria" },
  { href: "/ops/turnos-extra", label: "Turnos Extra", icon: Clock3, subKey: "turnos_extra" },
  { href: "/ops/refuerzos", label: "Refuerzos", icon: Shield, subKey: "turnos_extra" },
  { href: "/ops/ppc", label: "PPC", icon: ShieldAlert, subKey: "ppc" },
  // ── Otros módulos ──
  { href: "/ops/marcaciones", label: "Marcaciones", icon: Fingerprint, subKey: "marcaciones" },
  { href: "/ops/supervision", label: "Supervisión", icon: ClipboardCheck, subKey: "supervision" },
  { href: "/ops/tickets", label: "Tickets", icon: Ticket, subKey: "tickets" },
  { href: "/ops/rondas", label: "Rondas", icon: Route, subKey: "rondas" },
  { href: "/ops/inventario", label: "Inventario", icon: Package, subKey: "inventario" },
];

function filterByPermissions(perms: RolePermissions) {
  return OPS_ITEMS.filter((item) => {
    if (!item.subKey) return true;
    return canView(perms, "ops", item.subKey);
  });
}

export function OpsSubnav() {
  const permissions = usePermissions();
  const visibleItems = filterByPermissions(permissions);
  return <SubNav items={visibleItems} />;
}
