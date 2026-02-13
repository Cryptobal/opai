'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { LucideIcon, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  show?: boolean;
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
  /** En móvil: mostrar botón Cerrar y padding inferior para que Salir quede visible */
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

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 border-r border-border bg-card flex flex-col transition-[width] duration-200 ease-out",
        showCloseButton ? "h-full max-h-full" : "h-screen",
        collapsed ? "w-[72px]" : "w-60",
        className
      )}
    >
      {/* Logo — compacto o solo icono; en móvil + botón Cerrar */}
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
          "flex-1 overflow-y-auto",
          showCloseButton ? "px-3.5 py-4" : "px-3 py-3"
        )}
      >
        <div className="space-y-0.5">
          {navItems.map((item) => {
            if (item.show === false) return null;

            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex items-center rounded-md transition-colors",
                  showCloseButton ? "text-base" : "text-sm",
                  collapsed
                    ? "justify-center px-0 py-2.5"
                    : showCloseButton
                    ? "gap-3.5 px-3.5 py-2.5"
                    : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                {/* Active indicator bar — siempre visible */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                )}
                <Icon
                  className={cn(
                    "shrink-0",
                    showCloseButton ? "h-5 w-5" : "h-4 w-4"
                  )}
                />
                {!collapsed && <span className={cn(showCloseButton && "leading-none")}>{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User footer — mt-auto para que quede abajo y no quede espacio vacío */}
      <div
        className={cn(
          "border-t border-border shrink-0 transition-[padding] duration-200 mt-auto",
          collapsed ? "p-2" : showCloseButton ? "p-4" : "p-3"
        )}
      >
        {/* User info */}
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
                      showCloseButton ? "text-[13px]" : "text-xs"
                    )}
                  >
                    {userEmail}
                  </p>
                )}
              </div>
            )}
          </Link>
        )}

        {/* Footer: contenido a la izquierda, botón cerrar/expandir siempre a la derecha */}
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
