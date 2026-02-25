'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ChevronRight, LucideIcon, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { ThemeLogo } from './ThemeLogo';

export interface NavSubItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  children?: NavSubItem[];
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  show?: boolean;
  children?: NavSubItem[];
  badge?: number;
}

export interface AppSidebarProps {
  navItems: NavItem[];
  logo?: ReactNode;
  footer?: ReactNode;
  userName?: string;
  userEmail?: string;
  onNavigate?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  className?: string;
  showCloseButton?: boolean;
  onClose?: () => void;
}

interface FlyoutState {
  item: NavItem;
  top: number;
}

export function AppSidebar({
  navItems,
  logo,
  footer,
  userName,
  userEmail,
  onNavigate,
  onToggleSidebar,
  isSidebarOpen = true,
  className,
  showCloseButton,
  onClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const collapsed = !isSidebarOpen;
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedSubSections, setExpandedSubSections] = useState<Set<string>>(new Set());
  const flyoutTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlyout = collapsed && !showCloseButton;

  const clearFlyoutTimer = () => {
    if (flyoutTimeout.current) {
      clearTimeout(flyoutTimeout.current);
      flyoutTimeout.current = null;
    }
  };

  const scheduleFlyoutClose = () => {
    clearFlyoutTimer();
    flyoutTimeout.current = setTimeout(() => setFlyout(null), 120);
  };

  const openFlyout = (item: NavItem, el: HTMLElement) => {
    clearFlyoutTimer();
    const rect = el.getBoundingClientRect();
    setFlyout({ item, top: rect.top });
  };

  const isItemActive = useCallback(
    (href: string) => pathname === href || pathname?.startsWith(href + '/'),
    [pathname]
  );

  // Auto-expand active module section (accordion: only one open at a time)
  useEffect(() => {
    for (const item of navItems) {
      if (item.children && item.children.length > 0) {
        const isModuleActive =
          isItemActive(item.href) ||
          item.children.some((child) => isItemActive(child.href));
        if (isModuleActive) {
          setExpandedSections((prev) => {
            if (prev.size === 1 && prev.has(item.href)) return prev;
            return new Set([item.href]);
          });
          break;
        }
      }
    }
  }, [pathname, navItems, isItemActive]);

  const toggleSection = (href: string) => {
    setExpandedSections((prev) => {
      if (prev.has(href)) {
        return new Set();
      }
      return new Set([href]);
    });
  };

  const toggleSubSection = (href: string) => {
    setExpandedSubSections((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  // Auto-expand active sub-sections
  useEffect(() => {
    for (const item of navItems) {
      if (item.children) {
        for (const child of item.children) {
          if (child.children && child.children.length > 0) {
            const isSubActive = isItemActive(child.href) || child.children.some((sc) => isItemActive(sc.href));
            if (isSubActive) {
              setExpandedSubSections((prev) => {
                if (prev.has(child.href)) return prev;
                const next = new Set(prev);
                next.add(child.href);
                return next;
              });
            }
          }
        }
      }
    }
  }, [pathname, navItems, isItemActive]);

  // Close flyout on route change
  useEffect(() => {
    setFlyout(null);
  }, [pathname]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 border-r border-border/60 bg-gradient-to-b from-card to-card/80 flex flex-col transition-[width] duration-200 ease-out",
        showCloseButton ? "h-full max-h-full" : "h-screen",
        collapsed ? "w-[72px]" : "w-64",
        className
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-transparent shrink-0 transition-[padding] duration-200 relative after:absolute after:bottom-0 after:left-3 after:right-3 after:h-px after:bg-gradient-to-r after:from-primary/30 after:via-border after:to-transparent",
          collapsed ? "justify-center px-0" : "gap-2.5 px-4",
          showCloseButton && "justify-between pr-2"
        )}
      >
        {logo || (
          <Link
            href="/hub"
            className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5")}
            onClick={onNavigate}
            title={collapsed ? "OPAI" : undefined}
          >
            <ThemeLogo width={28} height={28} className="h-7 w-7" />
            {!collapsed && (
              <span
                className={cn(
                  "font-semibold tracking-tight",
                  showCloseButton ? "text-base" : "text-sm"
                )}
              >
                OPAI
              </span>
            )}
          </Link>
        )}
        {showCloseButton && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto scrollbar-thin",
          showCloseButton ? "px-2.5 py-3" : "px-2 py-2.5"
        )}
      >
        <div className="space-y-0.5">
          {navItems.map((item) => {
            if (item.show === false) return null;

            const hasChildren = item.children && item.children.length > 0;
            const isModuleActive =
              isItemActive(item.href) ||
              (hasChildren && item.children!.some((child) => isItemActive(child.href)));
            const isExpanded = expandedSections.has(item.href);
            const Icon = item.icon;

            // Simple item (no children) - e.g. "Inicio", "Guardias"
            if (!hasChildren) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  onMouseEnter={(e) => {
                    if (!showFlyout) return;
                    openFlyout(item, e.currentTarget);
                  }}
                  onMouseLeave={() => showFlyout && scheduleFlyoutClose()}
                  className={cn(
                    "group relative flex items-center rounded-md transition-colors",
                    showCloseButton ? "text-[15px]" : "text-sm",
                    collapsed
                      ? "justify-center px-0 py-2.5"
                      : showCloseButton
                      ? "gap-3 px-3 py-2.5"
                      : "gap-3 px-3 py-2",
                    isModuleActive
                      ? "bg-primary/15 text-primary font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                  )}
                >
                  {isModuleActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-primary/60" />
                  )}
                  <span className="relative shrink-0">
                    <Icon className={cn("shrink-0", showCloseButton ? "h-5 w-5" : "h-[18px] w-[18px]")} />
                    {item.badge != null && item.badge > 0 && (
                      <span
                        className={cn(
                          "absolute rounded-full bg-destructive text-destructive-foreground animate-pulse",
                          collapsed
                            ? "top-0 right-0 h-2 w-2 -translate-y-0.5 translate-x-0.5"
                            : "top-0 right-0 min-w-[18px] h-[18px] text-[10px] font-semibold flex items-center justify-center px-1 -translate-y-1/2 translate-x-1/2"
                        )}
                      >
                        {!collapsed && (item.badge > 99 ? '99+' : item.badge)}
                      </span>
                    )}
                  </span>
                  {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                </Link>
              );
            }

            // Module with children
            return (
              <div key={item.href} className="space-y-0.5">
                {/* Module header: nombre navega al módulo, flecha expande/contrae */}
                <div
                  className={cn(
                    "group relative flex items-center rounded-md transition-colors",
                    showCloseButton ? "text-[15px]" : "text-sm",
                    collapsed
                      ? "justify-center px-0 py-2.5"
                      : showCloseButton
                      ? "gap-3 px-3 py-2.5"
                      : "gap-3 px-3 py-2",
                    isModuleActive
                      ? "bg-primary/15 text-primary font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                  )}
                  onMouseEnter={(e) => {
                    if (!showFlyout) return;
                    openFlyout(item, e.currentTarget);
                  }}
                  onMouseLeave={() => showFlyout && scheduleFlyoutClose()}
                >
                  {isModuleActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-primary/60" />
                  )}
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex flex-1 min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      collapsed ? "justify-center px-0 py-0" : ""
                    )}
                  >
                    <Icon className={cn("shrink-0", showCloseButton ? "h-5 w-5" : "h-[18px] w-[18px]")} />
                    {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                  </Link>
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSection(item.href);
                      }}
                      className="shrink-0 -mr-1 p-1 rounded hover:bg-accent/80 transition-colors"
                      aria-label={isExpanded ? "Contraer menú" : "Expandir menú"}
                    >
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </button>
                  )}
                </div>

                {/* Children (expanded sidebar only) */}
                {!collapsed && (
                  <div
                    className={cn(
                      "overflow-hidden transition-all duration-200 ease-out",
                      isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
                    )}
                  >
                    <div className="ml-3 border-l border-border/60 pl-0 space-y-px py-0.5">
                      {item.children!.map((child) => {
                        const isChildActive = isItemActive(child.href);
                        const ChildIcon = child.icon;
                        const hasSubChildren = child.children && child.children.length > 0;

                        if (hasSubChildren) {
                          const isSubGroupActive = isChildActive || child.children!.some((sc) => isItemActive(sc.href));
                          const isSubExpanded = expandedSubSections.has(child.href);

                          return (
                            <div key={child.href} className="space-y-px">
                              <div
                                onClick={() => toggleSubSection(child.href)}
                                className={cn(
                                  "group relative flex items-center rounded-md transition-colors cursor-pointer select-none",
                                  showCloseButton ? "text-[13px] gap-2.5 px-3 py-2" : "text-[13px] gap-2.5 px-3 py-[6px]",
                                  isSubGroupActive
                                    ? "bg-accent text-foreground font-medium"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                )}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleSubSection(child.href);
                                  }
                                }}
                              >
                                {isSubGroupActive && (
                                  <span className="absolute -left-px top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-full bg-primary" />
                                )}
                                {ChildIcon && (
                                  <ChildIcon
                                    className={cn(
                                      "shrink-0 h-3.5 w-3.5",
                                      isSubGroupActive ? "text-primary" : "text-muted-foreground/70"
                                    )}
                                  />
                                )}
                                <span className="flex-1 truncate">{child.label}</span>
                                <ChevronRight
                                  className={cn(
                                    "h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                                    isSubExpanded && "rotate-90"
                                  )}
                                />
                              </div>
                              <div
                                className={cn(
                                  "overflow-hidden transition-all duration-200 ease-out",
                                  isSubExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
                                )}
                              >
                                <div className="ml-3 border-l border-border/40 pl-0 space-y-px py-0.5">
                                  {child.children!.map((subChild) => {
                                    const isSubChildActive = isItemActive(subChild.href);
                                    const SubChildIcon = subChild.icon;
                                    return (
                                      <Link
                                        key={subChild.href}
                                        href={subChild.href}
                                        onClick={onNavigate}
                                        className={cn(
                                          "group relative flex items-center rounded-md transition-colors",
                                          showCloseButton ? "text-[12px] gap-2 px-3 py-1.5" : "text-[12px] gap-2 px-3 py-[5px]",
                                          isSubChildActive
                                            ? "bg-accent text-foreground font-medium"
                                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                        )}
                                      >
                                        {isSubChildActive && (
                                          <span className="absolute -left-px top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-r-full bg-primary" />
                                        )}
                                        {SubChildIcon && (
                                          <SubChildIcon
                                            className={cn(
                                              "shrink-0 h-3 w-3",
                                              isSubChildActive ? "text-primary" : "text-muted-foreground/70"
                                            )}
                                          />
                                        )}
                                        <span className="truncate">{subChild.label}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavigate}
                            className={cn(
                              "group relative flex items-center rounded-md transition-colors",
                              showCloseButton ? "text-[13px] gap-2.5 px-3 py-2" : "text-[13px] gap-2.5 px-3 py-[6px]",
                              isChildActive
                                ? "bg-accent text-foreground font-medium"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            )}
                          >
                            {isChildActive && (
                              <span className="absolute -left-px top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-full bg-primary" />
                            )}
                            {ChildIcon && (
                              <ChildIcon
                                className={cn(
                                  "shrink-0 h-3.5 w-3.5",
                                  isChildActive ? "text-primary" : "text-muted-foreground/70"
                                )}
                              />
                            )}
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Flyout panel when sidebar is collapsed (desktop only) */}
        {showFlyout && flyout && (
          <div
            className="fixed left-[72px] z-50 min-w-[180px] rounded-lg bg-popover text-popover-foreground shadow-lg border border-border animate-in fade-in-0 zoom-in-95 slide-in-from-left-1 duration-150"
            style={{ top: flyout.top }}
            onMouseEnter={clearFlyoutTimer}
            onMouseLeave={scheduleFlyoutClose}
          >
            {/* Module title */}
            {flyout.item.children && flyout.item.children.length > 0 ? (
              <>
                <Link
                  href={flyout.item.href}
                  onClick={() => { setFlyout(null); onNavigate?.(); }}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-foreground border-b border-border/60 hover:bg-accent/50 rounded-t-lg transition-colors"
                >
                  {flyout.item.label}
                </Link>
                <div className="py-1.5 px-1.5 space-y-0.5">
                  {flyout.item.children.map((child) => {
                    const isChildActive = isItemActive(child.href);
                    const ChildIcon = child.icon;
                    const hasSubChildren = child.children && child.children.length > 0;

                    if (hasSubChildren) {
                      const isSubGroupActive = isChildActive || child.children!.some((sc) => isItemActive(sc.href));
                      return (
                        <div key={child.href}>
                          <div
                            className={cn(
                              "flex items-center gap-2.5 px-2.5 py-[6px] text-[13px] font-medium",
                              isSubGroupActive ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {ChildIcon && (
                              <ChildIcon
                                className={cn(
                                  "shrink-0 h-3.5 w-3.5",
                                  isSubGroupActive ? "text-primary" : "text-muted-foreground/60"
                                )}
                              />
                            )}
                            <span>{child.label}</span>
                          </div>
                          <div className="ml-3 border-l border-border/40 pl-0 space-y-0.5 mb-1">
                            {child.children!.map((subChild) => {
                              const isSubChildActive = isItemActive(subChild.href);
                              const SubChildIcon = subChild.icon;
                              return (
                                <Link
                                  key={subChild.href}
                                  href={subChild.href}
                                  onClick={() => { setFlyout(null); onNavigate?.(); }}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-2.5 py-[5px] text-[12px] transition-colors",
                                    isSubChildActive
                                      ? "bg-accent text-foreground font-medium"
                                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                  )}
                                >
                                  {SubChildIcon && (
                                    <SubChildIcon
                                      className={cn(
                                        "shrink-0 h-3 w-3",
                                        isSubChildActive ? "text-primary" : "text-muted-foreground/60"
                                      )}
                                    />
                                  )}
                                  <span>{subChild.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => { setFlyout(null); onNavigate?.(); }}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] transition-colors",
                          isChildActive
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        {ChildIcon && (
                          <ChildIcon
                            className={cn(
                              "shrink-0 h-3.5 w-3.5",
                              isChildActive ? "text-primary" : "text-muted-foreground/60"
                            )}
                          />
                        )}
                        <span>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : (
              <Link
                href={flyout.item.href}
                onClick={() => { setFlyout(null); onNavigate?.(); }}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/50 rounded-lg transition-colors whitespace-nowrap"
              >
                {flyout.item.label}
              </Link>
            )}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div
        className={cn(
          "border-t border-border/60 shrink-0 transition-[padding] duration-200 mt-auto",
          collapsed ? "p-2" : showCloseButton ? "p-3.5" : "p-3"
        )}
      >
        {(userName || userEmail) && (
          <Link
            href="/opai/perfil"
            onClick={onNavigate}
            title={collapsed ? userName || userEmail : undefined}
            className={cn(
              "flex rounded-md transition-colors hover:bg-accent",
              collapsed
                ? "justify-center p-2 mb-1"
                : showCloseButton
                ? "items-center gap-2.5 px-2.5 py-2 mb-2"
                : "items-center gap-2.5 px-2 py-1.5 mb-2"
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary ring-2 ring-primary/20",
                showCloseButton ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"
              )}
            >
              {userName?.charAt(0)?.toUpperCase() || userEmail?.charAt(0)?.toUpperCase() || '?'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                {userName && (
                  <p
                    className={cn(
                      "truncate font-medium text-foreground",
                      showCloseButton ? "text-sm" : "text-xs"
                    )}
                  >
                    {userName}
                  </p>
                )}
                {userEmail && (
                  <p
                    className={cn(
                      "truncate text-muted-foreground",
                      showCloseButton ? "text-[13px]" : "text-[11px]"
                    )}
                  >
                    {userEmail}
                  </p>
                )}
              </div>
            )}
          </Link>
        )}

        <div className={cn("flex gap-1 w-full", collapsed ? "flex-col items-center" : "items-center")}>
          {footer && (
            <div
              className={cn(
                "min-w-0",
                collapsed && "[&>a]:flex [&>a]:w-full [&>a]:justify-center [&>a>span]:hidden"
              )}
            >
              {footer}
            </div>
          )}
          {onToggleSidebar && (
            <span className={cn(collapsed ? "" : "ml-auto")}>
              <button
                type="button"
                className="hidden lg:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                onClick={onToggleSidebar}
                aria-label={isSidebarOpen ? 'Contraer navegación' : 'Expandir navegación'}
              >
                {isSidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
              </button>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
