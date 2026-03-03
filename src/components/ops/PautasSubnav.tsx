"use client";

import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import { usePermissions } from "@/lib/permissions-context";
import { canView, type RolePermissions } from "@/lib/permissions";
import {
  CalendarDays,
  UserRoundCheck,
  Clock3,
  Shield,
  ShieldAlert,
  ClipboardList,
} from "lucide-react";

const PAUTAS_ITEMS: (SubNavItem & { subKey: string })[] = [
  { href: "/ops/pauta-mensual", label: "Mensual", icon: CalendarDays, subKey: "pauta_mensual" },
  { href: "/ops/pauta-diaria", label: "Diaria", icon: UserRoundCheck, subKey: "pauta_diaria" },
  { href: "/ops/turnos-extra", label: "Turnos Extra", icon: Clock3, subKey: "turnos_extra" },
  { href: "/ops/refuerzos", label: "Refuerzos", icon: Shield, subKey: "turnos_extra" },
  { href: "/ops/ppc", label: "PPC", icon: ShieldAlert, subKey: "ppc" },
  { href: "/ops/audit-pautas", label: "Auditoría", icon: ClipboardList, subKey: "pauta_mensual" },
];

function filterByPermissions(perms: RolePermissions) {
  return PAUTAS_ITEMS.filter((item) => canView(perms, "ops", item.subKey));
}

export function PautasSubnav() {
  const permissions = usePermissions();
  const visibleItems = filterByPermissions(permissions);
  return <SubNav items={visibleItems} />;
}
