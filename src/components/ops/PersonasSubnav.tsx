"use client";

import { SubNav } from "@/components/opai";
import { LayoutDashboard, ClipboardList, CalendarDays, UserRoundCheck, Clock3, ShieldAlert, Shield, Ban } from "lucide-react";

export function PersonasSubnav() {
  return (
    <SubNav
      items={[
        { href: "/ops", label: "Inicio", icon: LayoutDashboard },
        { href: "/ops/puestos", label: "Puestos", icon: ClipboardList },
        { href: "/ops/pauta-mensual", label: "Pauta mensual", icon: CalendarDays },
        { href: "/ops/pauta-diaria", label: "Asistencia diaria", icon: UserRoundCheck },
        { href: "/ops/turnos-extra", label: "Turnos extra", icon: Clock3 },
        { href: "/ops/ppc", label: "PPC", icon: ShieldAlert },
        { href: "/personas/guardias", label: "Guardias", icon: Shield },
        { href: "/personas/lista-negra", label: "Lista negra", icon: Ban },
      ]}
    />
  );
}
