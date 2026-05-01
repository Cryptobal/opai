"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlatform } from "@/hooks/usePlatform";

export interface NavItem<TId extends string = string> {
  id: TId;
  label: string;
  icon: LucideIcon;
  /** Estilo especial opcional (ej. botón de pánico en rojo) */
  variant?: "default" | "danger" | "warning";
  /** Número opcional que se muestra como badge sobre el icono (0 oculta). */
  badge?: number;
}

interface PlatformAwareBottomNavProps<TId extends string = string> {
  items: NavItem<TId>[];
  activeId: TId;
  onSelect: (id: TId) => void;
  /** Si quieres forzar un estilo en vez de detectar plataforma */
  forceVariant?: "ios" | "android" | "auto";
  /** Safe-area padding ya aplicado por el componente */
  className?: string;
}

export function PlatformAwareBottomNav<TId extends string = string>({
  items,
  activeId,
  onSelect,
  forceVariant = "auto",
  className,
}: PlatformAwareBottomNavProps<TId>) {
  const detected = usePlatform();
  const variant: "ios" | "android" =
    forceVariant === "auto"
      ? detected === "ios"
        ? "ios"
        : "android"
      : forceVariant;

  if (variant === "ios") {
    return (
      <nav
        className={cn(
          "fixed z-50 left-3 right-3 bottom-3 opai-liquid-glass rounded-full px-2 py-2 flex gap-1",
          className,
        )}
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Navegación principal"
      >
        {items.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeId;
          const showBadge = typeof tab.badge === "number" && tab.badge > 0;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2 rounded-full transition-all",
                isActive && "opai-liquid-glass-nav-item-active",
                tab.variant === "danger" && "text-status-danger-fg",
                tab.variant === "warning" && "text-status-warn-fg",
              )}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={cn(
                    isActive ? "text-white opai-icon-bounce" : "text-white/60",
                    tab.variant === "danger" && !isActive && "text-status-danger-fg",
                    tab.variant === "warning" && !isActive && "text-status-warn-fg",
                  )}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-status-warn text-white text-[9px] font-bold px-1 leading-none">
                    {tab.badge! > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "font-display text-[10px] mt-0.5 font-semibold",
                  isActive ? "text-white" : "text-white/50",
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "fixed z-50 bottom-0 left-0 right-0 opai-m3e-nav pt-2 px-2 flex justify-around",
        className,
      )}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      aria-label="Navegación principal"
    >
      {items.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeId;
        const showBadge = typeof tab.badge === "number" && tab.badge > 0;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className="flex-1 flex flex-col items-center justify-center py-1"
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
          >
            <div
              className={cn(
                "relative px-5 py-1 rounded-full flex items-center justify-center transition-all",
                isActive && "opai-m3e-pill opai-pill-indicator",
                tab.variant === "danger" && isActive && "!bg-status-danger",
                tab.variant === "warning" && isActive && "!bg-status-warn",
              )}
            >
              <Icon
                size={isActive ? 22 : 20}
                strokeWidth={isActive ? 2.5 : 2}
                className={cn(
                  isActive ? "text-white opai-icon-bounce" : "text-white/60",
                  tab.variant === "danger" && !isActive && "text-status-danger-fg",
                  tab.variant === "warning" && !isActive && "text-status-warn-fg",
                )}
              />
              {showBadge && (
                <span className="absolute -top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-status-warn text-white text-[9px] font-bold px-1 leading-none">
                  {tab.badge! > 9 ? "9+" : tab.badge}
                </span>
              )}
            </div>
            <span
              className={cn(
                "font-display text-[10px] mt-1 font-semibold",
                isActive ? "text-[#3385FF]" : "text-white/55",
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
