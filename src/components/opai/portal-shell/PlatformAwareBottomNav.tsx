"use client";

import { useEffect, useRef } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Expone `--portal-bottom-nav-height` (px desde el tope del nav hasta el borde inferior visible). */
function usePortalBottomNavHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId: number | null = null;
    let lastClearance = "";

    const measure = () => {
      rafId = null;
      const rect = el.getBoundingClientRect();
      if (rect.height < 1) {
        document.documentElement.style.removeProperty("--portal-bottom-nav-height");
        lastClearance = "";
        return;
      }
      const vp = window.visualViewport;
      const viewportBottom = vp ? vp.offsetTop + vp.height : window.innerHeight;
      // +8px de colchón para evitar solapamiento por subpíxeles / blur del nav.
      const clearance = Math.max(0, Math.ceil(viewportBottom - rect.top) + 8);
      const next = `${clearance}px`;
      if (next === lastClearance) return;
      lastClearance = next;
      document.documentElement.style.setProperty("--portal-bottom-nav-height", next);
    };

    const scheduleUpdate = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    scheduleUpdate();
    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(el);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      document.documentElement.style.removeProperty("--portal-bottom-nav-height");
    };
  }, [ref]);
}

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
  const navRef = useRef<HTMLElement>(null);
  usePortalBottomNavHeight(navRef);
  // `forceVariant` se mantiene por compatibilidad de API pero ya no cambia el
  // material: Liquid Glass v1 usa una sola isla glass en todas las plataformas.
  void forceVariant;

  return (
    <nav
      ref={navRef}
      data-portal-bottom-nav=""
      className={cn(
        // Isla glass única (iOS === Android), despegada de los bordes.
        "fixed z-50 left-[max(env(safe-area-inset-left),0.75rem)] right-[max(env(safe-area-inset-right),0.75rem)] bottom-[calc(env(safe-area-inset-bottom,0px)+10px)] opai-glass-strong px-2 py-2 flex gap-1 sm:mx-auto sm:max-w-[560px]",
        className,
      )}
      aria-label="Navegación principal"
    >
      {items.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeId;
        const showBadge = typeof tab.badge === "number" && tab.badge > 0;
        const danger = tab.variant === "danger";
        const warning = tab.variant === "warning";
        const activeColor = danger
          ? "text-status-danger-fg"
          : warning
            ? "text-status-warn-fg"
            : "text-primary";
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className="relative flex-1 flex flex-col items-center justify-center min-h-[52px] py-1 rounded-full transition-all active:scale-95"
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <span
                aria-hidden
                className={cn(
                  "opai-nav-pill",
                  danger && "opai-nav-pill-danger",
                  warning && "opai-nav-pill-warning",
                )}
              />
            )}
            <div className="relative">
              <Icon
                size={21}
                strokeWidth={isActive ? 2.5 : 2}
                className={cn(
                  isActive ? cn(activeColor, "opai-icon-bounce") : "text-white/60",
                  danger && !isActive && "text-status-danger-fg",
                  warning && !isActive && "text-status-warn-fg",
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
                "relative font-display text-[10px] mt-0.5 font-semibold",
                isActive ? activeColor : "text-white/55",
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
