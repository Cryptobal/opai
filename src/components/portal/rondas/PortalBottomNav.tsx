"use client";

import { MapPin, MessageCircle, FileWarning, AlertTriangle, User } from "lucide-react";
import { PlatformAwareBottomNav, type NavItem } from "@/components/opai/portal-shell";

export type PortalTab = "mis-rondas" | "chat" | "incidente" | "panico" | "perfil";

interface PortalBottomNavProps {
  activeScreen: string;
  onNavigate: (tab: PortalTab) => void;
}

const tabs: NavItem<PortalTab>[] = [
  { id: "mis-rondas", label: "Rondas", icon: MapPin },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "panico", label: "Pánico", icon: AlertTriangle, variant: "danger" },
  { id: "incidente", label: "Incidente", icon: FileWarning, variant: "warning" },
  { id: "perfil", label: "Perfil", icon: User },
];

export function PortalBottomNav({ activeScreen, onNavigate }: PortalBottomNavProps) {
  const activeId: PortalTab =
    activeScreen === "ronda-activa" || activeScreen === "completada"
      ? "mis-rondas"
      : activeScreen === "incidente"
        ? "incidente"
        : (tabs.find((t) => t.id === activeScreen)?.id ?? "mis-rondas");

  return <PlatformAwareBottomNav items={tabs} activeId={activeId} onSelect={onNavigate} />;
}
