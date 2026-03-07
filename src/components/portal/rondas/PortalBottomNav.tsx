"use client";

import { MapPin, MessageCircle, AlertTriangle, User } from "lucide-react";

export type PortalTab = "mis-rondas" | "chat" | "panico" | "perfil";

interface PortalBottomNavProps {
  activeScreen: string;
  onNavigate: (tab: PortalTab) => void;
}

const tabs: { id: PortalTab; label: string; icon: typeof MapPin }[] = [
  { id: "mis-rondas", label: "Rondas", icon: MapPin },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "panico", label: "Panico", icon: AlertTriangle },
  { id: "perfil", label: "Perfil", icon: User },
];

export function PortalBottomNav({ activeScreen, onNavigate }: PortalBottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-sm"
      style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {tabs.map((tab) => {
        const isPanico = tab.id === "panico";
        const isActive = !isPanico && (
          tab.id === activeScreen ||
          (tab.id === "mis-rondas" && (activeScreen === "ronda-activa" || activeScreen === "completada"))
        );

        if (isPanico) {
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate("panico")}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-red-950/80 px-4 py-1.5 transition-colors active:bg-red-900"
              aria-label="Activar panico"
            >
              <tab.icon className="h-6 w-6 text-red-400" />
              <span className="text-[10px] font-medium text-red-400">{tab.label}</span>
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
            <tab.icon className={`h-6 w-6 ${isActive ? "text-teal-400" : "text-gray-400"}`} />
            <span className={`text-[10px] font-medium ${isActive ? "text-teal-400" : "text-gray-400"}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
