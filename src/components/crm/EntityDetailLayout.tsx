"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { RecordActions } from "./RecordActions";

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
      /** Background color class or hex (e.g. "bg-blue-500" or "#3b82f6") */
      color?: string;
      /** Custom icon instead of initials */
      icon?: LucideIcon;
    };
    /** Main title */
    title: string;
    /** Subtitle (RUT, cargo, code, etc.) */
    subtitle?: string;
    /** Status badge */
    status?: {
      label: string;
      variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
    };
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
  breadcrumbHrefs,
  header,
  tabs,
  activeTab,
  onTabChange,
  children,
  className,
}: EntityDetailLayoutProps) {
  const visibleTabs = tabs.filter((t) => !t.hidden);

  // Split actions into primary (visible buttons) and secondary (dropdown)
  const allActions = (header.actions || []).filter((a) => !a.hidden);
  const primaryActions = allActions.filter((a) => a.primary);
  const secondaryActions = allActions.filter((a) => !a.primary);

  const AvatarIcon = header.avatar?.icon;

  return (
    <div className={cn("min-w-0 -mt-3 sm:-mt-4 lg:-mt-5", className)}>
      {/* ── Sticky Header + Tab Bar (single container to avoid gap) ── */}
      <div
        className={cn(
          "sticky top-0 lg:top-12 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
          "-mx-2 px-4 sm:-mx-3 sm:px-6",
          "lg:-ml-2 lg:-mr-8 lg:pl-4 lg:pr-8",
          "xl:-ml-3 xl:-mr-10 xl:pl-6 xl:pr-10",
          "2xl:-ml-4 2xl:-mr-12 2xl:pl-6 2xl:pr-12"
        )}
      >
        {/* ── Header ── */}
        <div className="pt-4 pb-3 border-b border-border">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs text-muted-foreground mb-3 min-h-[28px] sm:min-h-0 flex-wrap"
          >
            {breadcrumb.map((segment, i) => {
              const isLast = i === breadcrumb.length - 1;
              const href = breadcrumbHrefs?.[i];

              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  )}
                  {isLast || !href ? (
                    <span
                      className={cn(
                        "truncate max-w-[200px]",
                        isLast
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {segment}
                    </span>
                  ) : (
                    <Link
                      href={href}
                      className="hover:text-foreground transition-colors truncate max-w-[200px]"
                    >
                      {segment}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>

          {/* Title row + actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {/* Avatar */}
              {header.avatar && (
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
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
                    <AvatarIcon className="h-5 w-5" />
                  ) : (
                    header.avatar.initials || "?"
                  )}
                </div>
              )}

              {/* Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-lg font-semibold tracking-tight truncate">
                    {header.title}
                  </h1>
                  {header.status && (
                    <Badge
                      variant={header.status.variant || "secondary"}
                      className="shrink-0"
                    >
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current mr-1" />
                      {header.status.label}
                    </Badge>
                  )}
                </div>
                {header.subtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {header.subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {header.extra}
              {/* Primary actions as visible buttons (hidden on mobile if >1) */}
              {primaryActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      primaryActions.length > 1 ? "hidden sm:inline-flex" : "",
                      action.variant === "destructive"
                        ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                        : "border-border hover:bg-muted text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{action.label}</span>
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
        />
      </div>

      {/* ── Tab Content ── */}
      <div className="pt-4 sm:pt-5">{children}</div>
    </div>
  );
}

/* ── Convenience hook for tab state ── */
export function useEntityTabs(defaultTab: string) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return { activeTab, setActiveTab } as const;
}
