"use client";

import { Home, ClipboardList, Users, MoreHorizontal } from "lucide-react";
import { PlatformAwareBottomNav, type NavItem } from "@/components/opai/portal-shell";
import type { TabId } from "./AccessPortalApp";

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: NavItem<TabId>[] = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "registro", label: "Registro", icon: ClipboardList },
  { id: "en-sitio", label: "En Sitio", icon: Users },
  { id: "mas", label: "Más", icon: MoreHorizontal },
];

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  return <PlatformAwareBottomNav items={tabs} activeId={activeTab} onSelect={onTabChange} />;
}
