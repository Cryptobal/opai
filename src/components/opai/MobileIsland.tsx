"use client";

/**
 * MobileIsland — isla contextual liquid-glass del ERP en móvil (<lg).
 *
 * Gramática (modo normal):
 *   [SurfaceSegment]  ·······  [🔍] [💬] [🔔]  │  [☰ módulo?]
 *        Zona A                    Zona C           Zona C'
 *
 * Modos:
 *  A. Normal: segmento + acciones globales (+ menú de módulo opcional)
 *  B. Detalle: chevron back + trailing (+ acción primaria); sin segmento ni C'
 *  C. Búsqueda: [←] [campo] [✕]; sin capas ni overlays
 *
 * Un módulo puede publicar menú (Zona C'), override de búsqueda y supresión
 * vía IslandModuleContext. Ningún módulo inyecta controles a la izquierda
 * del SurfaceSegment.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, ChevronLeft, MessageCircle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeLogo } from "./ThemeLogo";
import {
  IconBubble,
  useBreadcrumbTrailing,
  useBreadcrumbTrailingSubtitle,
  useIslandAction,
  useIslandModule,
  useIslandSearchOpenListener,
} from "@/components/opai-ds";
import { resolveNavContext } from "@/lib/nav/resolve-context";
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
  /** Abre el Command Palette; acepta query inicial (retrocompatible). */
  onSearch: (initialQuery?: string) => void;
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
  const trailingSubtitle = useBreadcrumbTrailingSubtitle();
  const islandAction = useIslandAction();
  const { moduleMenu, search: moduleSearch, suppressed } = useIslandModule();
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Plan B (H2): en viewports ≤360 px el título baja de ~90 px utilizables
  // con segmento + 3 botones. El chat ya está en BottomNav (OpaiOrb).
  const [hideChatInIsland, setHideChatInIsland] = useState(false);
  // En ≤320 px con menú de módulo + búsqueda propia: ocultar también Search
  // (el módulo ya tiene acceso a búsqueda por el drawer / atajos).
  const [hideSearchInIsland, setHideSearchInIsland] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mqChat = window.matchMedia("(max-width: 360px)");
    const mqSearch = window.matchMedia("(max-width: 320px)");
    const apply = () => {
      setHideChatInIsland(mqChat.matches);
      setHideSearchInIsland(mqSearch.matches);
    };
    apply();
    mqChat.addEventListener("change", apply);
    mqSearch.addEventListener("change", apply);
    return () => {
      mqChat.removeEventListener("change", apply);
      mqSearch.removeEventListener("change", apply);
    };
  }, []);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctx = mounted ? resolveNavContext(pathname) : null;
  const isHub = pathname === "/hub" || pathname.startsWith("/hub/");
  const isDetail = mounted && !!trailing;
  const productividadLanding = resolveProductividadLanding(
    permissions,
    isModuleEnabled,
  );
  const showSegment = mounted && productividadLanding !== null;
  const homeHref =
    surface === "productividad" ? (productividadLanding ?? "/hub") : "/hub";

  const usingModuleSearch = Boolean(moduleSearch);
  const showModuleSearchBtn =
    !hideSearchInIsland || !moduleMenu || !usingModuleSearch;

  const btnBase = cn(
    "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ds-text-3",
    "transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 active:scale-95",
    "motion-reduce:transition-none",
  );

  const back = () => {
    if (ctx?.parentHref) router.push(ctx.parentHref);
    else router.back();
  };

  const title = isHub || !ctx ? "OPAI" : ctx.shortTitle;

  const exitSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchOpen(false);
    setSearchValue("");
    if (moduleSearch) moduleSearch.onExit?.();
  };

  const commitSearch = (value: string) => {
    const q = value.trim();
    if (!q) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch(q);
    exitSearch();
  };

  // Autofocus al entrar en modo búsqueda
  useEffect(() => {
    if (!searchOpen) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  // Escape / gesto atrás conceptual: salir del modo búsqueda
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitSearch();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // Al navegar, salir del modo búsqueda
  useEffect(() => {
    if (searchOpen) exitSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Atajos de teclado del módulo: abrir modo búsqueda de la isla.
  useIslandSearchOpenListener(() => {
    if (moduleSearch) setSearchOpen(true);
  });

  const onPaletteSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        commitSearch(value);
      }, 200);
    }
  };

  const fieldValue = usingModuleSearch ? (moduleSearch?.value ?? "") : searchValue;
  const fieldPlaceholder = moduleSearch?.placeholder ?? "Buscar…";
  const onFieldChange = (value: string) => {
    if (usingModuleSearch) {
      moduleSearch?.onChange(value);
      return;
    }
    onPaletteSearchChange(value);
  };

  if (suppressed) return null;

  const badgeLabel =
    moduleMenu && moduleMenu.badge && moduleMenu.badge > 0
      ? moduleMenu.badge > 99
        ? "99+"
        : String(moduleMenu.badge)
      : null;

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
          "pointer-events-auto opai-glass-strong opai-glass-shell flex min-h-12 items-center gap-1 rounded-[22px] pl-3 pr-1",
          "md:mx-auto md:w-full md:max-w-[860px]",
        )}
      >
        {searchOpen ? (
          /* ── Modo búsqueda: cambio de árbol, sin overlay ── */
          <>
            <button
              type="button"
              onClick={exitSearch}
              className={btnBase}
              aria-label="Salir de búsqueda"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <input
              ref={searchInputRef}
              id={usingModuleSearch ? "correos-search-input-mobile" : undefined}
              type="search"
              value={fieldValue}
              onChange={(e) => onFieldChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (usingModuleSearch) {
                    // Módulo: Enter solo confirma/blur; el filtro ya vive en onChange.
                    searchInputRef.current?.blur();
                    return;
                  }
                  commitSearch(searchValue);
                }
              }}
              onBlur={() => {
                if (!fieldValue.trim()) exitSearch();
              }}
              placeholder={fieldPlaceholder}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              className={cn(
                "min-w-0 flex-1 bg-transparent text-[13px] text-ds-text-1 placeholder:text-ds-text-4",
                "outline-none border-0 focus:ring-0",
              )}
              aria-label={usingModuleSearch ? fieldPlaceholder : "Buscar en OPAI"}
            />
            {fieldValue.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onFieldChange("");
                  searchInputRef.current?.focus();
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        ) : isDetail ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button type="button" onClick={back} className={cn(btnBase, "shrink-0")} aria-label="Volver">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div key={pathname + trailing + (trailingSubtitle ?? "")} className="min-w-0 flex-1 animate-in fade-in duration-200">
              <p className="truncate text-sm font-semibold leading-tight text-ds-text-1">{trailing}</p>
              {(trailingSubtitle || ctx?.title) && (
                <p className="truncate text-[12px] leading-tight text-ds-text-3">
                  {trailingSubtitle || ctx?.title}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {showSegment ? (
              /* Solo el switch ERP/Prod — el segmento ancla la ubicación. */
              <SurfaceSegment
                surface={surface}
                variant="compact"
                className="shrink-0"
              />
            ) : (
              <Link
                href={homeHref}
                key={pathname}
                className="flex min-w-0 flex-1 items-center gap-2 hover:opacity-80"
              >
                {isHub || !ctx ? (
                  <ThemeLogo
                    width={28}
                    height={28}
                    className="h-7 w-7 shrink-0"
                  />
                ) : (
                  <IconBubble
                    icon={ctx.icon}
                    tone={ctx.iconTone}
                    size="sm"
                    className="shrink-0"
                  />
                )}
                <span className="truncate text-sm font-semibold tracking-tight text-ds-text-1">
                  {title}
                </span>
              </Link>
            )}
          </div>
        )}

        {/* Derecha: oculta en modo búsqueda (salen del árbol) */}
        {!searchOpen &&
          (isDetail && islandAction ? (
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
          ) : !isDetail ? (
            <div className="flex shrink-0 items-center gap-px">
              {showModuleSearchBtn && (
                <button
                  type="button"
                  className={btnBase}
                  onClick={() => setSearchOpen(true)}
                  aria-label="Buscar"
                >
                  <Search className="h-5 w-5" />
                </button>
              )}
              {!hideChatInIsland && (
                <button type="button" className={btnBase} onClick={onToggleChat} aria-label="Abrir chat">
                  <MessageCircle className="h-5 w-5" />
                  {chatUnread > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-2 ring-background" />
                  )}
                </button>
              )}
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
              {/* Zona C': menú de módulo — solo modo normal */}
              {moduleMenu && (
                <>
                  <span
                    aria-hidden
                    className="mx-0.5 h-5 w-px shrink-0 bg-[var(--glass-border)]"
                  />
                  <button
                    type="button"
                    className={btnBase}
                    onClick={moduleMenu.onOpen}
                    aria-label={
                      badgeLabel
                        ? `${moduleMenu.label} — ${moduleMenu.badge} sin leer`
                        : moduleMenu.label
                    }
                  >
                    <moduleMenu.icon className="h-5 w-5" />
                    {badgeLabel && (
                      <span
                        aria-hidden
                        className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[12px] font-semibold leading-none text-white shadow-ds-xs"
                      >
                        {badgeLabel}
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>
          ) : null)}
      </div>
    </header>
  );
}
