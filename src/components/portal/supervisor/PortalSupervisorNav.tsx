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

const PRIMARY_NAV: Array<{
  id: SupervisorSection;
  label: string;
  icon: React.ElementType;
}> = [
  { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { id: "visitas", label: "Visitas", icon: ClipboardCheck },
  { id: "mi-equipo", label: "Equipo", icon: Users },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

export function PortalSupervisorNav({ active, onChange, onMoreOpen, visitasPendientes = 0 }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800">
      <div className="flex items-center justify-around px-2 py-1 safe-area-inset-bottom">
        {PRIMARY_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-[60px] rounded-lg transition-colors ${
              active === id
                ? "text-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon size={22} />
            <span className="text-[10px] leading-none">{label}</span>
          </button>
        ))}
        <button
          onClick={() => onMoreOpen?.()}
          className="relative flex flex-col items-center gap-0.5 py-2 px-3 min-w-[60px] rounded-lg transition-colors text-zinc-500 hover:text-zinc-300"
        >
          <div className="relative">
            <Menu size={22} />
            {visitasPendientes > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-orange-500 text-white text-[9px] font-bold px-1 leading-none">
                {visitasPendientes > 9 ? "9+" : visitasPendientes}
              </span>
            )}
          </div>
          <span className="text-[10px] leading-none">Más</span>
        </button>
      </div>
    </nav>
  );
}
