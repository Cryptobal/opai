'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { ChevronRight, LucideIcon, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

export interface NavSubItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  show?: boolean;
  children?: NavSubItem[];
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
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const showTooltip = collapsed && !showCloseButton;

  const isItemActive = useCallback(
    (href: string) => pathname === href || pathname?.startsWith(href + '/'),
    [pathname]
  );

  // Auto-expand active module section
  useEffect(() => {
    for (const item of navItems) {
      if (item.children && item.children.length > 0) {
        const isModuleActive =
          isItemActive(item.href) ||
          item.children.some((child) => isItemActive(child.href));
        if (isModuleActive) {
          setExpandedSections((prev) => {
            if (prev.has(item.href)) return prev;
            const next = new Set(prev);
            next.add(item.href);
            return next;
          });
        }
      }
    }
  }, [pathname, navItems, isItemActive]);

  const toggleSection = (href: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 border-r border-border bg-card flex flex-col transition-[width] duration-200 ease-out",
        showCloseButton ? "h-full max-h-full" : "h-screen",
        collapsed ? "w-[72px]" : "w-64",
        className
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-border shrink-0 transition-[padding] duration-200",
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
            <Image
              src="/logo%20escudo%20blanco.png"
              alt="Gard Security"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
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

            // Simple item (no children) - e.g. "Inicio"
            if (!hasChildren) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  onMouseEnter={(e) => {
                    if (!showTooltip) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({ label: item.label, top: rect.top + rect.height / 2 });
                  }}
                  onMouseLeave={() => showTooltip && setTooltip(null)}
                  className={cn(
                    "group relative flex items-center rounded-md transition-colors",
                    showCloseButton ? "text-[15px]" : "text-sm",
                    collapsed
                      ? "justify-center px-0 py-2.5"
                      : showCloseButton
                      ? "gap-3 px-3 py-2.5"
                      : "gap-3 px-3 py-2",
                    isModuleActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  {isModuleActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                  )}
                  <Icon className={cn("shrink-0", showCloseButton ? "h-5 w-5" : "h-[18px] w-[18px]")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            }

            // Module with children
            return (
              <div key={item.href} className="space-y-0.5">
                {/* Module header */}
                <div
                  className={cn(
                    "group relative flex items-center rounded-md transition-colors cursor-pointer select-none",
                    showCloseButton ? "text-[15px]" : "text-sm",
                    collapsed
                      ? "justify-center px-0 py-2.5"
                      : showCloseButton
                      ? "gap-3 px-3 py-2.5"
                      : "gap-3 px-3 py-2",
                    isModuleActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                  onMouseEnter={(e) => {
                    if (!showTooltip) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({ label: item.label, top: rect.top + rect.height / 2 });
                  }}
                  onMouseLeave={() => showTooltip && setTooltip(null)}
                  onClick={() => {
                    if (collapsed) {
                      onNavigate?.();
                      window.location.href = item.href;
                      return;
                    }
                    toggleSection(item.href);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (collapsed) {
                        window.location.href = item.href;
                      } else {
                        toggleSection(item.href);
                      }
                    }
                  }}
                >
                  {isModuleActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                  )}
                  <Icon className={cn("shrink-0", showCloseButton ? "h-5 w-5" : "h-[18px] w-[18px]")} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </>
                  )}
                </div>

                {/* Children */}
                {!collapsed && (
                  <div
                    className={cn(
                      "overflow-hidden transition-all duration-200 ease-out",
                      isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                    )}
                  >
                    <div className="ml-3 border-l border-border/60 pl-0 space-y-px py-0.5">
                      {item.children!.map((child) => {
                        const isChildActive = isItemActive(child.href);
                        const ChildIcon = child.icon;

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

        {/* Tooltip on hover when sidebar is collapsed (desktop only) */}
        {showTooltip && tooltip && (
          <div
            className="fixed left-[72px] z-50 -translate-y-1/2 px-2.5 py-1.5 rounded-md bg-popover text-popover-foreground text-sm font-medium shadow-md border border-border pointer-events-none whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ top: tooltip.top }}
          >
            {tooltip.label}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div
        className={cn(
          "border-t border-border shrink-0 transition-[padding] duration-200 mt-auto",
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
                "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary",
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
                className="hidden lg:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
