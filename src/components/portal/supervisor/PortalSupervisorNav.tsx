"use client";

import {
  LayoutDashboard,
  ClipboardCheck,
  Users,
  MessageSquare,
  Calendar,
  Clock,
  Receipt,
  AlertTriangle,
  MapPin,
  Ticket,
  Briefcase,
  Siren,
  Menu,
} from "lucide-react";
import { PlatformAwareBottomNav, type NavItem } from "@/components/opai/portal-shell";

export type SupervisorSection =
  | "dashboard"
  | "visitas"
  | "visita-tecnica"
  | "pautas"
  | "turnos-extra"
  | "alertas-cobertura"
  | "rendiciones"
  | "refuerzos"
  | "mi-equipo"
  | "instalaciones"
  | "tickets"
  | "chat";

export const MORE_NAV: Array<{
  id: SupervisorSection;
  label: string;
  icon: React.ElementType;
}> = [
  { id: "pautas", label: "Pautas", icon: Calendar },
  { id: "turnos-extra", label: "Turnos Extra", icon: Clock },
  { id: "alertas-cobertura", label: "Alertas Cobertura", icon: Siren },
  { id: "rendiciones", label: "Rendiciones", icon: Receipt },
  { id: "refuerzos", label: "Refuerzos", icon: AlertTriangle },
  { id: "instalaciones", label: "Instalaciones", icon: MapPin },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "visita-tecnica", label: "Visita Técnica", icon: Briefcase },
];

interface Props {
  active: SupervisorSection;
  onChange: (s: SupervisorSection) => void;
  onMoreOpen?: () => void;
  visitasPendientes?: number;
}

type NavId = SupervisorSection | "more";

export function PortalSupervisorNav({ active, onChange, onMoreOpen, visitasPendientes = 0 }: Props) {
  const items: NavItem<NavId>[] = [
    { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
    { id: "visitas", label: "Visitas", icon: ClipboardCheck },
    { id: "mi-equipo", label: "Equipo", icon: Users },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "more", label: "Más", icon: Menu, badge: visitasPendientes },
  ];

  const primaryIds: NavId[] = ["dashboard", "visitas", "mi-equipo", "chat"];
  const activeId: NavId = primaryIds.includes(active) ? active : "more";

  return (
    <PlatformAwareBottomNav
      items={items}
      activeId={activeId}
      onSelect={(id) => {
        if (id === "more") {
          onMoreOpen?.();
        } else {
          onChange(id);
        }
      }}
    />
  );
}
