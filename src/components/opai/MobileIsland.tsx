"use client";

/**
 * MobileIsland — isla contextual liquid-glass del ERP en móvil (<lg).
 *
 * Modos:
 *  A. Normal: [SurfaceSegment] [título elástico] [buscar] [chat] [campana]
 *     Sin acceso a Productividad: logo/ícono + título (sin segmento).
 *  B. Detalle: chevron back + trailing (+ acción primaria); sin segmento
 *  C. Condensación al scroll (useScrollDirection, respeta reduced-motion)
 *  D. Búsqueda: cambio de modo dentro de la isla (bloque 4)
 *
 * Regla de no solapamiento: un único flex-1 min-w-0 (bloque título);
 * segmento y botones son shrink-0 con ancho declarado.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronLeft, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeLogo } from "./ThemeLogo";
import { IconBubble, useBreadcrumbTrailing, useIslandAction } from "@/components/opai-ds";
import { resolveNavContext } from "@/lib/nav/resolve-context";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { usePermissions } from "@/lib/permissions-context";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import {
  DEFAULT_SURFACE,
  resolveProductividadLanding,
  type Surface,
} from "@/lib/surface";
import { SurfaceSegment } from "./SurfaceSegment";

interface MobileIslandProps {
  surface?: Surface;
  onSearch: () => void;
  onToggleChat: () => void;
  onToggleNotifications: () => void;
  chatUnread: number;
  notifUnread: number;
}

export function MobileIsland({
  surface = DEFAULT_SURFACE,
  onSearch,
  onToggleChat,
  onToggleNotifications,
  chatUnread,
  notifUnread,
}: MobileIslandProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const trailing = useBreadcrumbTrailing();
  const islandAction = useIslandAction();
  const condensed = useScrollDirection(24);
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();

  // Evita mismatch de hidratación: el contexto (título/ícono) es puramente de
  // cliente; en el primer render mostramos el estado base (logo).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ctx = mounted ? resolveNavContext(pathname) : null;
  const isHub = pathname === "/hub" || pathname.startsWith("/hub/");
  const isDetail = mounted && !!trailing;
  const showSegment =
    mounted && resolveProductividadLanding(permissions, isModuleEnabled) !== null;

  const btnBase = cn(
    "relative inline-flex shrink-0 items-center justify-center rounded-xl text-ds-text-3",
    "transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 active:scale-95",
    "motion-reduce:transition-none",
    condensed ? "h-[34px] w-[34px]" : "h-10 w-10",
  );

  const back = () => {
    if (ctx?.parentHref) router.push(ctx.parentHref);
    else router.back();
  };

  const title = isHub || !ctx ? "OPAI" : ctx.shortTitle;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 lg:hidden pointer-events-none"
      style={{
        paddingLeft: "max(env(safe-area-inset-left), 0.75rem)",
        paddingRight: "max(env(safe-area-inset-right), 0.75rem)",
        paddingTop: "calc(env(safe-area-inset-top) + 8px)",
      }}
    >
      <div
        className={cn(
          "pointer-events-auto opai-glass-strong flex items-center gap-1 transition-all duration-[250ms] ease-out motion-reduce:transition-none",
          condensed ? "min-h-[36px] rounded-[17px] pl-2 pr-1" : "min-h-12 rounded-[22px] pl-3 pr-1",
        )}
      >
        {/* ── Left: contexto (A / B) — único bloque elástico ── */}
        {isDetail ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button type="button" onClick={back} className={cn(btnBase, "shrink-0")} aria-label="Volver">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div key={pathname + trailing} className="min-w-0 flex-1 animate-in fade-in duration-200">
              <p className="truncate text-sm font-semibold leading-tight text-ds-text-1">{trailing}</p>
              {ctx?.title && !condensed && (
                <p className="truncate text-[12px] leading-tight text-ds-text-3">{ctx.title}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {showSegment && (
              <SurfaceSegment
                surface={surface}
                variant="compact"
                condensed={condensed}
                className="shrink-0"
              />
            )}
            <Link
              href="/hub"
              key={pathname}
              className="flex min-w-0 flex-1 items-center gap-2 hover:opacity-80"
            >
              {!showSegment &&
                (isHub || !ctx ? (
                  <ThemeLogo
                    width={28}
                    height={28}
                    className={cn("shrink-0 transition-all", condensed ? "h-6 w-6" : "h-7 w-7")}
                  />
                ) : (
                  <IconBubble
                    icon={ctx.icon}
                    tone={ctx.iconTone}
                    size="sm"
                    className={cn("shrink-0 transition-all", condensed && "scale-90")}
                  />
                ))}
              <span className="truncate text-sm font-semibold tracking-tight text-ds-text-1">
                {title}
              </span>
            </Link>
          </div>
        )}

        {/* ── Right: acción de detalle o botones estándar (shrink-0) ── */}
        {isDetail && islandAction ? (
          <div className="shrink-0 pl-1">
            {islandAction.href ? (
              <Link
                href={islandAction.href}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground active:scale-95"
              >
                {islandAction.icon && <islandAction.icon className="h-4 w-4" />}
                <span className="truncate max-w-[8rem]">{islandAction.label}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={islandAction.onClick}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground active:scale-95"
              >
                {islandAction.icon && <islandAction.icon className="h-4 w-4" />}
                <span className="truncate max-w-[8rem]">{islandAction.label}</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex shrink-0 items-center gap-px transition-opacity duration-[250ms] ease-out motion-reduce:transition-none",
              condensed && "opacity-70",
            )}
          >
            <button type="button" className={btnBase} onClick={onSearch} aria-label="Buscar">
              <Search className="h-5 w-5" />
            </button>
            <button type="button" className={btnBase} onClick={onToggleChat} aria-label="Abrir chat">
              <MessageCircle className="h-5 w-5" />
              {chatUnread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-2 ring-background" />
              )}
            </button>
            <button
              type="button"
              className={btnBase}
              onClick={onToggleNotifications}
              aria-label="Notificaciones"
            >
              <Bell className="h-5 w-5" />
              {notifUnread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-2 ring-background" />
              )}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
