"use client";

import {
  LayoutDashboard,
  ClipboardCheck,
  Users,
  MessageSquare,
  Menu,
  Calendar,
  Clock,
  Receipt,
  AlertTriangle,
  MapPin,
  Ticket,
  Briefcase,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

export type SupervisorSection =
  | "dashboard"
  | "visitas"
  | "visita-tecnica"
  | "pautas"
  | "turnos-extra"
  | "rendiciones"
  | "refuerzos"
  | "mi-equipo"
  | "instalaciones"
  | "tickets"
  | "chat";

interface Props {
  active: SupervisorSection;
  onChange: (s: SupervisorSection) => void;
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

const MORE_NAV: Array<{
  id: SupervisorSection;
  label: string;
  icon: React.ElementType;
}> = [
  { id: "pautas", label: "Pautas", icon: Calendar },
  { id: "turnos-extra", label: "Turnos Extra", icon: Clock },
  { id: "rendiciones", label: "Rendiciones", icon: Receipt },
  { id: "refuerzos", label: "Refuerzos", icon: AlertTriangle },
  { id: "instalaciones", label: "Instalaciones", icon: MapPin },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "visita-tecnica", label: "Visita Técnica", icon: Briefcase },
];

export function PortalSupervisorNav({ active, onChange }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  function handleMore(id: SupervisorSection) {
    onChange(id);
    setMoreOpen(false);
  }

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

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-[60px] rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
              <Menu size={22} />
              <span className="text-[10px] leading-none">Más</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-zinc-950 border-zinc-800 text-white pb-safe">
            <SheetHeader>
              <SheetTitle className="text-white text-left">Más opciones</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 mt-4 pb-4">
              {MORE_NAV.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleMore(id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors ${
                    active === id
                      ? "bg-blue-950 text-blue-400 border border-blue-800"
                      : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <Icon size={24} />
                  <span className="text-xs text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
