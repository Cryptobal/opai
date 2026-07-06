"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { RecordActions } from "./RecordActions";
import { useSetBreadcrumbTrailing } from "@/components/opai-ds";

/* ── Types ── */

export interface EntityTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Badge count shown next to the label */
  count?: number;
  /** Hide this tab entirely */
  hidden?: boolean;
}

export interface EntityHeaderAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "default" | "destructive";
  /** Show as a visible button instead of inside the "..." menu */
  primary?: boolean;
  hidden?: boolean;
}

export interface EntityDetailLayoutProps {
  /** Breadcrumb path segments (e.g. ["CRM", "Cuentas", "Sicomaq"]) */
  breadcrumb: string[];
  /** Breadcrumb href for each segment except the last. Length must be breadcrumb.length - 1 */
  breadcrumbHrefs?: string[];
  /** Header configuration */
  header: {
    /** Avatar / icon config */
    avatar?: {
      /** Initials to show (e.g. "S") */
      initials?: string;
      /** Background color class or hex (e.g. "bg-status-info" or "#3b82f6") */
      color?: string;
      /** Custom icon instead of initials */
      icon?: LucideIcon;
      /** Photo/logo URL — renders as image instead of initials */
      photoUrl?: string | null;
    };
    /** Main title */
    title: string;
    /** Subtitle — shown only on mobile (desktop hides it, info goes in General tab) */
    subtitle?: string;
    /** Status badge */
    status?: {
      label: string;
      variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
      /** Custom hex color for the badge (overrides variant styling) */
      color?: string;
    };
    /** Optional small adornment rendered next to the status chip (e.g. warning icon with tooltip) */
    statusAdornment?: ReactNode;
    /** Actions shown in the header */
    actions?: EntityHeaderAction[];
    /** Extra content slot to the right (e.g. toggle, custom button) */
    extra?: ReactNode;
  };
  /** Tab definitions */
  tabs: EntityTab[];
  /** Currently active tab id */
  activeTab: string;
  /** Tab change callback */
  onTabChange: (tabId: string) => void;
  /** Content of the active tab */
  children: ReactNode;
  /** Sub-tabs rendered inside sticky, below ChipTabs */
  subTabs?: ReactNode;
  /** Right panel for associated records (desktop: sidebar, mobile: accordion below content) */
  rightPanel?: ReactNode;
  /**
   * Optional left panel (desktop: sticky 264px column left of the content, mobile: rendered
   * above the content). Additive — undefined preserves the previous single-column behavior.
   * The node is responsible for its own mobile treatment (e.g. collapsible accordion).
   */
  leftPanel?: ReactNode;
  /** Optional pipeline bar rendered between header and tabs */
  pipelineBar?: ReactNode;
  /** Thin row inside the sticky block, below tabs (e.g. totals + sync status) */
  stickyMeta?: ReactNode;
  /** Called when the avatar is clicked (e.g. to upload a photo/logo) */
  onAvatarClick?: () => void;
  /** Additional class on the root container */
  className?: string;
}

/**
 * EntityDetailLayout — Patrón universal de ficha de detalle con tabs.
 *
 * ┌───────────────────────────────────────────────────┐
 * │ HEADER STICKY                                      │
 * │ CRM > Cuentas > Sicomaq (breadcrumb)              │
 * │ [Avatar]  Nombre    ● Estado          [Acciones]  │
 * │           Subtítulo                                │
 * ├───────────────────────────────────────────────────┤
 * │ TAB BAR (flex-wrap, NUNCA scroll horizontal)       │
 * │ [Info] [Contactos] [Instalaciones] [Comercial]    │
 * ├───────────────────────────────────────────────────┤
 * │                                                    │
 * │ CONTENIDO DE LA TAB ACTIVA                        │
 * │                                                    │
 * └───────────────────────────────────────────────────┘
 */
export function EntityDetailLayout({
  breadcrumb,
  breadcrumbHrefs: _breadcrumbHrefs,
  header,
  tabs,
  activeTab,
  onTabChange,
  children,
  subTabs,
  rightPanel,
  leftPanel,
  pipelineBar,
  stickyMeta,
  onAvatarClick,
  className,
}: EntityDetailLayoutProps) {
  // Publica el último segmento del breadcrumb (nombre de la entidad) para
  // que el `<AutoBreadcrumbs />` global del AppShell lo muestre como
  // último crumb. El breadcrumb local in-place fue eliminado: la fuente
  // de verdad ahora vive arriba (debajo del topbar). Caemos al título
  // del header si no se pasó breadcrumb.
  const trailingName = breadcrumb[breadcrumb.length - 1] ?? header.title;
  useSetBreadcrumbTrailing(trailingName);

  const visibleTabs = tabs.filter((t) => !t.hidden);

  // Split actions into primary (visible buttons) and secondary (dropdown)
  const allActions = (header.actions || []).filter((a) => !a.hidden);
  const primaryActions = allActions.filter((a) => a.primary);
  const secondaryActions = allActions.filter((a) => !a.primary);

  const AvatarIcon = header.avatar?.icon;

  return (
    <div className={cn("min-w-0 -mt-3 sm:-mt-4 lg:mt-0", className)}>
      {/* ── Sticky Header + Tab Bar (single container to avoid gap) ── */}
      <div
        className={cn(
          "sticky top-0 z-10 bg-background",
          "-mx-2 px-4 sm:-mx-3 sm:px-6",
          "lg:-ml-4 lg:-mr-8 lg:pl-4 lg:pr-8",
          "xl:-ml-5 xl:-mr-10 xl:pl-5 xl:pr-10",
          "2xl:-ml-6 2xl:-mr-12 2xl:pl-6 2xl:pr-12"
        )}
      >
        {/* ── Header ── */}
        <div className="pt-2 sm:pt-4 lg:pt-3 pb-1.5 sm:pb-2">
          {/* Breadcrumb in-place removido — vive arriba del contenido en
              `<AutoBreadcrumbs />` (montado en AppShell). El nombre de la
              entidad se publica vía useSetBreadcrumbTrailing arriba. */}

          {/* Title row + actions
           *
           * Mobile: avatar + título a la izquierda, cluster de acciones a la derecha
           * con flex-wrap y tamaño reducido. El badge de estado se mueve a su propia
           * fila debajo del título para no pelear con los botones.
           *
           * Desktop (≥sm): todo en una fila, badge al lado del título como antes.
           */}
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
              {/* Avatar — más chico en mobile para liberar ancho al título */}
              {header.avatar && (
                <button
                  type="button"
                  onClick={onAvatarClick}
                  disabled={!onAvatarClick}
                  className={cn("shrink-0", onAvatarClick && "cursor-pointer hover:opacity-80 transition-opacity")}
                  title={onAvatarClick ? "Cambiar logo" : undefined}
                >
                  {header.avatar.photoUrl ? (
                    <img
                      src={header.avatar.photoUrl}
                      alt=""
                      className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border border-border bg-background object-contain"
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full text-sm sm:text-base font-semibold",
                        header.avatar.color?.startsWith("#") || header.avatar.color?.startsWith("rgb")
                          ? "text-white"
                          : header.avatar.color || "bg-primary/10 text-primary"
                      )}
                      style={
                        header.avatar.color?.startsWith("#") || header.avatar.color?.startsWith("rgb")
                          ? { backgroundColor: header.avatar.color }
                          : undefined
                      }
                    >
                      {AvatarIcon ? (
                        <AvatarIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                      ) : (
                        header.avatar.initials || "?"
                      )}
                    </div>
                  )}
                </button>
              )}

              {/* Info — el nombre puede usar 2 líneas en mobile para no truncar agresivamente */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight leading-tight line-clamp-2 sm:truncate min-w-0">
                    {header.title}
                  </h1>
                  {/* Badge: al lado del título solo en ≥sm. En mobile va inline debajo, compacto. */}
                  {header.status && (
                    <Badge
                      variant={header.status.color ? "outline" : (header.status.variant || "secondary")}
                      className="shrink-0 hidden sm:inline-flex"
                      style={header.status.color ? {
                        borderColor: `${header.status.color}40`,
                        color: header.status.color,
                        backgroundColor: `${header.status.color}15`,
                      } : undefined}
                    >
                      <span
                        className={cn("inline-flex h-1.5 w-1.5 rounded-full mr-1", !header.status.color && "bg-current")}
                        style={header.status.color ? { backgroundColor: header.status.color } : undefined}
                      />
                      {header.status.label}
                    </Badge>
                  )}
                  {header.statusAdornment && (
                    <span className="shrink-0 hidden sm:inline-flex">{header.statusAdornment}</span>
                  )}
                </div>
                {header.subtitle && (
                  <p className="text-sm text-ds-text-3 mt-1 truncate lg:hidden">
                    {header.subtitle}
                  </p>
                )}
                {/* Mobile-only: chip de estado compacto, mismo renglón que subtítulo si existiera */}
                {header.status && (
                  <div className="mt-1 sm:hidden flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight",
                        !header.status.color && "bg-muted text-muted-foreground"
                      )}
                      style={header.status.color ? {
                        color: header.status.color,
                        backgroundColor: `${header.status.color}15`,
                      } : undefined}
                    >
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", !header.status.color && "bg-current")}
                        style={header.status.color ? { backgroundColor: header.status.color } : undefined}
                      />
                      {header.status.label}
                    </span>
                    {header.statusAdornment}
                  </div>
                )}
              </div>
            </div>

            {/* Actions: wrap limpio en mobile, con tope de ancho menos agresivo (40%) para dejar respirar al nombre */}
            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 shrink-0 max-w-[44%] sm:max-w-none">
              {header.extra}
              {/* Primary actions as visible buttons (hidden on mobile if >1) */}
              {primaryActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={action.onClick}
                    title={action.label}
                    className={cn(
                      "inline-flex items-center justify-center rounded-md border h-8 w-8 transition-colors",
                      primaryActions.length > 1 ? "hidden sm:inline-flex" : "",
                      action.variant === "destructive"
                        ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                        : "border-border hover:bg-muted text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
              {/* Secondary actions in dropdown */}
              {secondaryActions.length > 0 && (
                <RecordActions
                  actions={secondaryActions.map((a) => ({
                    label: a.label,
                    icon: a.icon,
                    onClick: a.onClick,
                    variant: a.variant,
                    hidden: a.hidden,
                  }))}
                />
              )}
            </div>
          </div>
        </div>

        {/* Pipeline bar */}
        {pipelineBar}

        {/* ── ChipTabs (inside sticky container) ── */}
        <ChipTabs
          tabs={visibleTabs.map((tab) => ({
            id: tab.id,
            label: tab.label,
            icon: tab.icon,
            badge: tab.count,
          }))}
          activeTab={activeTab}
          onTabChange={onTabChange}
          compact
          centered={false}
        />

        {stickyMeta ? (
          <div className="border-t border-border/50 bg-muted/15 px-0 py-2 -mb-px">{stickyMeta}</div>
        ) : null}

        {/* ── Sub-tabs (inside sticky) ── */}
        {subTabs}
      </div>

      {/* ── Content area: main + optional right panel ── */}
      <div className={cn("lg:flex", subTabs ? "pt-14 sm:pt-16" : "pt-4 sm:pt-5")}>
        {leftPanel ? (
          <div className="mb-4 lg:mb-0 lg:mr-6 lg:w-[264px] lg:shrink-0 lg:self-start lg:sticky lg:top-12 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto">
            {leftPanel}
          </div>
        ) : null}
        <div className="flex-1 min-w-0">{children}</div>
        {rightPanel}
      </div>
    </div>
  );
}

/* ── Convenience hook for tab state ── */
export function useEntityTabs(defaultTab: string) {
  // Soporta deep-link a tabs con ?tab=contracts en la URL. Se lee solo al
  // montar (es el comportamiento esperado: navegar dentro del detalle no
  // debe re-leer el query). Setters posteriores se manejan en memoria.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return defaultTab;
    const url = new URL(window.location.href);
    return url.searchParams.get("tab") ?? defaultTab;
  });
  return { activeTab, setActiveTab } as const;
}
