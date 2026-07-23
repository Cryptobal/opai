"use client";

/**
 * MobileIsland — isla contextual liquid-glass del ERP en móvil (<lg).
 *
 * Asume el rol de "dónde estoy" que antes cubrían breadcrumb + PageHero:
 *
 *  A. Título contextual: en /hub muestra el logo OPAI; en cualquier otra ruta,
 *     el ícono del nodo (con su tono) + el título corto resuelto del registry
 *     (`resolveNavContext`), con crossfade al navegar. Tap → /hub.
 *  B. Modo detalle: si hay trailing publicado (nombre de entidad), la isla
 *     muestra chevron back (→ listado padre del registry, fallback router.back),
 *     el trailing como título + subtítulo (sección), y a la derecha la acción
 *     primaria publicada (IslandActionContext) si existe.
 *  C. Condensación al scroll (useScrollDirection, respeta reduced-motion).
 *  D. Búsqueda: tap en la lupa abre el Command Palette (modal) — ver nota.
 *
 * Nota (idea D): el Command Palette no expone hoy un estado de query
 * compartido, así que el "morph" a campo de búsqueda dentro de la isla
 * requeriría un refactor mayor del palette. Se toma el fallback documentado
 * en el brief: la lupa abre el modal existente.
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

interface MobileIslandProps {
  onSearch: () => void;
  onToggleChat: () => void;
  onToggleNotifications: () => void;
  chatUnread: number;
  notifUnread: number;
}

export function MobileIsland({
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

  // Evita mismatch de hidratación: el contexto (título/ícono) es puramente de
  // cliente; en el primer render mostramos el estado base (logo).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ctx = mounted ? resolveNavContext(pathname) : null;
  const isHub = pathname === "/hub" || pathname.startsWith("/hub/");
  const isDetail = mounted && !!trailing;

  const btnBase =
    "relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95";

  const back = () => {
    if (ctx?.parentHref) router.push(ctx.parentHref);
    else router.back();
  };

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
          "pointer-events-auto opai-glass-strong flex items-center justify-between transition-all duration-[250ms] ease-out motion-reduce:transition-none",
          condensed ? "min-h-[36px] rounded-[17px] pl-2 pr-1" : "min-h-12 rounded-[22px] pl-3 pr-1",
        )}
      >
        {/* ── Left: contexto (A / B) ── */}
        {isDetail ? (
          <div className="flex min-w-0 items-center gap-1">
            <button type="button" onClick={back} className={cn(btnBase, "w-9 shrink-0")} aria-label="Volver">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div key={pathname + trailing} className="min-w-0 animate-in fade-in duration-200">
              <p className="truncate text-sm font-semibold leading-tight text-ds-text-1">{trailing}</p>
              {ctx?.title && !condensed && (
                <p className="truncate text-[12px] leading-tight text-ds-text-3">{ctx.title}</p>
              )}
            </div>
          </div>
        ) : isHub || !ctx ? (
          <Link href="/hub" className="flex shrink-0 items-center gap-2 hover:opacity-80">
            <ThemeLogo width={28} height={28} className={cn("transition-all", condensed ? "h-6 w-6" : "h-7 w-7")} />
            <span className="text-sm font-semibold tracking-tight">OPAI</span>
          </Link>
        ) : (
          <Link
            href="/hub"
            key={pathname}
            className="flex min-w-0 items-center gap-2 hover:opacity-80 animate-in fade-in duration-200"
          >
            <IconBubble
              icon={ctx.icon}
              tone={ctx.iconTone}
              size="sm"
              className={cn("shrink-0 transition-all", condensed && "scale-90")}
            />
            <span className="truncate text-sm font-semibold tracking-tight text-ds-text-1">
              {ctx.shortTitle}
            </span>
          </Link>
        )}

        {/* ── Right: acción de detalle o botones estándar ── */}
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
              "flex shrink-0 items-center gap-0.5 transition-all duration-[250ms] ease-out origin-right motion-reduce:transition-none",
              condensed && "scale-90 opacity-60",
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
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-2 ring-background animate-pulse" />
              )}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
