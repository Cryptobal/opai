"use client";

import { MapPin, MessageCircle, FileWarning, AlertTriangle, User } from "lucide-react";

export type PortalTab = "mis-rondas" | "chat" | "incidente" | "panico" | "perfil";

interface PortalBottomNavProps {
  activeScreen: string;
  onNavigate: (tab: PortalTab) => void;
}

const tabs: { id: PortalTab; label: string; icon: typeof MapPin }[] = [
  { id: "mis-rondas", label: "Rondas", icon: MapPin },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "incidente", label: "Incidente", icon: FileWarning },
  { id: "panico", label: "Panico", icon: AlertTriangle },
  { id: "perfil", label: "Perfil", icon: User },
];

export function PortalBottomNav({ activeScreen, onNavigate }: PortalBottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[1000] flex items-center justify-around border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-sm"
      style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {tabs.map((tab) => {
        const isPanico = tab.id === "panico";
        const isIncidente = tab.id === "incidente";
        const isActive = !isPanico && !isIncidente && (
          tab.id === activeScreen ||
          (tab.id === "mis-rondas" && (activeScreen === "ronda-activa" || activeScreen === "completada"))
        );

        if (isPanico) {
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate("panico")}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-red-950/80 px-3 py-1.5 transition-colors active:bg-red-900"
              aria-label="Activar panico"
            >
              <tab.icon className="h-5 w-5 text-red-400" />
              <span className="text-[9px] font-medium text-red-400">{tab.label}</span>
            </button>
          );
        }

        if (isIncidente) {
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate("incidente")}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-amber-950/80 px-3 py-1.5 transition-colors active:bg-amber-900"
              aria-label="Reportar incidente"
            >
              <tab.icon className="h-5 w-5 text-amber-400" />
              <span className="text-[9px] font-medium text-amber-400">{tab.label}</span>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 transition-colors"
            aria-label={tab.label}
          >
            <tab.icon className={`h-5 w-5 ${isActive ? "text-teal-400" : "text-gray-400"}`} />
            <span className={`text-[9px] font-medium ${isActive ? "text-teal-400" : "text-gray-400"}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
