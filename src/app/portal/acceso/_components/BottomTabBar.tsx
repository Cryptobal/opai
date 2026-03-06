"use client";

import { Home, ClipboardList, Users, MoreHorizontal } from "lucide-react";
import type { TabId } from "./AccessPortalApp";

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "registro", label: "Registro", icon: ClipboardList },
  { id: "en-sitio", label: "En Sitio", icon: Users },
  { id: "mas", label: "Mas", icon: MoreHorizontal },
];

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-800 bg-[#0A0F1C]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-stretch">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? "text-[#06B6D4]"
                  : "text-gray-500 active:text-gray-300"
              }`}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={`h-5 w-5 ${isActive ? "text-[#06B6D4]" : "text-gray-500"}`}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
