'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Home, Briefcase, Shield, Users, LayoutGrid,
  ChevronLeft, MoreHorizontal,
  Landmark, Wallet, FolderOpen, FileBarChart, Clock,
  Settings, Monitor, Eye, Sun, Moon, User, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBottomNavItems, type BottomNavItem } from '@/lib/module-nav';
import { usePermissions } from '@/lib/permissions-context';
import { hasModuleAccess, canView, hasCapability } from '@/lib/permissions';
import { ChatSidePanelContext } from '@/components/chat/ChatFloatingProvider';
import { RoleSwitcher } from '@/components/navbar/RoleSwitcher';
import { useTheme } from './ThemeProvider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Tracks BottomNav real height and exposes it as --bottom-nav-height CSS variable */
function useBottomNavHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--bottom-nav-height', `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--bottom-nav-height');
    };
  }, [ref]);
}

interface BottomNavProps {
  userRole?: string;
}

/* ── Main bottom nav items (always 5) ── */

interface MainNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  isDrawer?: boolean;
}

const MAIN_NAV: MainNavItem[] = [
  { key: "home", href: "/hub", label: "Inicio", icon: Home },
  { key: "comercial", href: "/crm", label: "Comercial", icon: Briefcase },
  { key: "operaciones", href: "/ops", label: "Operaciones", icon: Shield },
  { key: "personas", href: "/personas/guardias", label: "Personas", icon: Users },
  { key: "mas", href: "#mas", label: "Más", icon: LayoutGrid, isDrawer: true },
];

/* ── Module route detection (is the user inside a specific module?) ── */

function getActiveModule(pathname: string): string | null {
  if (pathname.startsWith("/crm")) return "crm";
  if (pathname.startsWith("/ops")) return "ops";
  if (pathname.startsWith("/personas")) return "personas";
  if (pathname.startsWith("/payroll")) return "payroll";
  if (pathname.startsWith("/finanzas")) return "finanzas";
  if (pathname.startsWith("/opai/configuracion")) return "config";
  if (pathname.startsWith("/opai/inicio") || pathname.startsWith("/opai/documentos") || pathname.startsWith("/opai/templates")) return "docs";
  if (pathname.startsWith("/te")) return "te";
  if (pathname.startsWith("/reportes/dt")) return "reportes_dt";
  return null;
}

/* ── Main export ── */

export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const navRef = useRef<HTMLElement>(null);
  useBottomNavHeight(navRef);

  if (!userRole || !pathname) return null;

  // Check if we're on a CPQ detail page (BottomNav hidden there — Phase 5)
  const isCpqDetail = /^\/crm\/cotizaciones\/[^/]+$/.test(pathname);
  if (isCpqDetail) return null;

  const permsOrRole = permissions.modules && Object.keys(permissions.modules).length > 0
    ? permissions
    : userRole;

  // Determine which mode to show
  const activeModule = getActiveModule(pathname);
  const moduleItems = activeModule ? getBottomNavItems(pathname, permsOrRole) : [];
  const isInModule = activeModule && moduleItems.length > 0;

  // Section-based nav (CRM detail pages)
  const hasSectionItems = moduleItems.some((item) => item.isSection);

  return (
    <nav ref={navRef} className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-background/95 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-around min-h-[56px] px-1 pb-[env(safe-area-inset-bottom)]">
        {hasSectionItems ? (
          <SectionNav items={moduleItems} />
        ) : isInModule ? (
          <ModuleSubNav items={moduleItems} activeModule={activeModule!} pathname={pathname} />
        ) : (
          <MainNav pathname={pathname} userRole={userRole} />
        )}
      </div>
    </nav>
  );
}

/* ════════════════════════════════════════════════════
   MAIN NAV — 5 fixed items (Inicio, Comercial, Operaciones, Personas, Más)
   ════════════════════════════════════════════════════ */

function MainNav({ pathname, userRole }: { pathname: string; userRole: string }) {
  const [masOpen, setMasOpen] = useState(false);

  return (
    <>
      {MAIN_NAV.map((item) => {
        if (item.isDrawer) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setMasOpen(true)}
              className="relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-3 py-1 active:scale-95 transition-all text-muted-foreground"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[11px] font-medium leading-tight">{item.label}</span>
            </button>
          );
        }

        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-3 py-1 active:scale-95 transition-all",
              isActive ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {isActive && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400 animate-in fade-in duration-200" />
            )}
            <span className="text-[11px] font-medium leading-tight">{item.label}</span>
          </Link>
        );
      })}

      <MasDrawer open={masOpen} onOpenChange={setMasOpen} userRole={userRole} />
    </>
  );
}

/* ════════════════════════════════════════════════════
   MÁS DRAWER — modules, tools, preferences
   ════════════════════════════════════════════════════ */

interface MasModuleItem {
  key: string;
  href?: string;
  label: string;
  icon: LucideIcon;
  color: string;
  action?: 'role-switcher' | 'theme-toggle' | 'logout' | 'profile';
  show: boolean;
}

function MasDrawer({ open, onOpenChange, userRole }: { open: boolean; onOpenChange: (v: boolean) => void; userRole: string }) {
  const permissions = usePermissions();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isAdmin = userRole === 'owner' || userRole === 'admin';

  const modules: MasModuleItem[] = useMemo(() => [
    { key: "finanzas", href: "/finanzas", label: "Finanzas", icon: Landmark, color: "text-amber-400", show: hasModuleAccess(permissions, "finance") },
    { key: "payroll", href: "/payroll", label: "Payroll", icon: Wallet, color: "text-violet-400", show: hasModuleAccess(permissions, "payroll") },
    { key: "documentos", href: "/opai/inicio", label: "Documentos", icon: FolderOpen, color: "text-sky-400", show: hasModuleAccess(permissions, "docs") },
    { key: "reportes-dt", href: "/reportes/dt", label: "Reportes DT", icon: FileBarChart, color: "text-rose-400", show: canView(permissions, "reportes_dt") },
    { key: "turnos-extra", href: "/te/registro", label: "Turnos Extra", icon: Clock, color: "text-orange-400", show: hasModuleAccess(permissions, "ops") },
  ], [permissions]);

  const tools: MasModuleItem[] = useMemo(() => [
    { key: "config", href: "/opai/configuracion", label: "Configuración", icon: Settings, color: "text-zinc-400", show: isAdmin },
    { key: "portales", href: "/portales", label: "Portales", icon: Monitor, color: "text-teal-400", show: isAdmin },
    { key: "simular-rol", label: "Simular Rol", icon: Eye, color: "text-blue-400", show: isAdmin, action: 'role-switcher' },
  ], [isAdmin]);

  const handleNavigate = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const visibleModules = modules.filter((m) => m.show);
  const visibleTools = tools.filter((t) => t.show);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl px-4 pt-3 pb-6">
          <SheetHeader className="sr-only">
            <SheetTitle>Más opciones</SheetTitle>
            <SheetDescription>Módulos, herramientas y preferencias</SheetDescription>
          </SheetHeader>

          {/* Drag handle */}
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Módulos */}
          {visibleModules.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Módulos</p>
              <div className="grid grid-cols-3 gap-2">
                {visibleModules.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => item.href && handleNavigate(item.href)}
                    className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl bg-muted/30 hover:bg-muted/50 active:scale-95 transition-all"
                  >
                    <item.icon className={cn("h-6 w-6", item.color)} />
                    <span className="text-[11px] font-medium text-foreground/80">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Herramientas */}
          {visibleTools.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Herramientas</p>
              <div className="grid grid-cols-3 gap-2">
                {visibleTools.map((item) => {
                  if (item.action === 'role-switcher') {
                    return (
                      <div key={item.key} className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl bg-muted/30">
                        <RoleSwitcher />
                      </div>
                    );
                  }
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => item.href && handleNavigate(item.href)}
                      className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl bg-muted/30 hover:bg-muted/50 active:scale-95 transition-all"
                    >
                      <item.icon className={cn("h-6 w-6", item.color)} />
                      <span className="text-[11px] font-medium text-foreground/80">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preferencias */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Preferencias</p>
            <div className="space-y-0.5">
              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-muted/50 active:scale-[0.98] transition-all"
              >
                {theme === 'dark' ? <Moon className="h-4.5 w-4.5 text-blue-400" /> : <Sun className="h-4.5 w-4.5 text-amber-400" />}
                <span>{theme === 'dark' ? 'Tema oscuro' : 'Tema claro'}</span>
              </button>

              {/* Profile */}
              <button
                type="button"
                onClick={() => handleNavigate('/opai/perfil')}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-muted/50 active:scale-[0.98] transition-all"
              >
                <User className="h-4.5 w-4.5" />
                <span>Mi Perfil</span>
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setShowSignOutDialog(true);
                }}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 active:scale-[0.98] transition-all"
              >
                <LogOut className="h-4.5 w-4.5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sign-out confirmation dialog */}
      <Dialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cerrar Sesión</DialogTitle>
            <DialogDescription>
              ¿Estás seguro que deseas cerrar sesión?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setShowSignOutDialog(false)}
              disabled={isSigningOut}
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors border border-border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                setIsSigningOut(true);
                await signOut({ callbackUrl: '/opai/login' });
              }}
              disabled={isSigningOut}
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {isSigningOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ════════════════════════════════════════════════════
   MODULE SUB-NAV — contextual sub-tabs with back button + overflow
   ════════════════════════════════════════════════════ */

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  ops: "Ops",
  personas: "Personas",
  payroll: "Payroll",
  finanzas: "Finanzas",
  config: "Config",
  docs: "Docs",
  te: "TE",
  reportes_dt: "DT",
};

function ModuleSubNav({ items, activeModule, pathname }: { items: BottomNavItem[]; activeModule: string; pathname: string }) {
  const router = useRouter();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const chatCtx = useContext(ChatSidePanelContext);

  // Max 4 visible items + back button + optional more button
  const MAX_VISIBLE = 4;
  const visibleItems = items.slice(0, MAX_VISIBLE);
  const overflowItems = items.slice(MAX_VISIBLE);
  const hasOverflow = overflowItems.length > 0;

  const handleBack = () => {
    // Navigate to /hub to reset to main nav
    router.push('/hub');
  };

  return (
    <>
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1 active:scale-95 transition-all text-muted-foreground border-r border-border/20 mr-1"
        aria-label="Volver"
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">{MODULE_LABELS[activeModule] || ''}</span>
      </button>

      {/* Visible sub-items */}
      {visibleItems.map((item) => {
        const isChatToggle = item.key === 'chat';
        const isActive = isChatToggle
          ? !!chatCtx?.isPanelOpen
          : (pathname === item.href || pathname.startsWith(item.href + '/'));
        const Icon = item.icon;

        const content = (
          <>
            <Icon className="h-5 w-5" />
            {isActive && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400 animate-in fade-in duration-200" />
            )}
            <span className="text-[11px] font-medium leading-tight truncate max-w-[60px]">{item.label}</span>
          </>
        );

        const itemClass = cn(
          "relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] flex-1 px-1 py-1 active:scale-95 transition-all",
          isActive ? "text-emerald-400" : "text-muted-foreground"
        );

        if (isChatToggle) {
          return (
            <button key={item.key} type="button" onClick={() => chatCtx?.togglePanel()} className={itemClass}>
              {content}
            </button>
          );
        }

        return (
          <Link key={item.key} href={item.href} className={itemClass}>
            {content}
          </Link>
        );
      })}

      {/* Overflow button */}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setOverflowOpen(true)}
          className="relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1 active:scale-95 transition-all text-muted-foreground"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[11px] font-medium leading-tight">Más</span>
        </button>
      )}

      {/* Overflow sheet */}
      {hasOverflow && (
        <Sheet open={overflowOpen} onOpenChange={setOverflowOpen}>
          <SheetContent side="bottom" className="max-h-[50vh] rounded-t-2xl px-4 pt-3 pb-6">
            <SheetHeader className="sr-only">
              <SheetTitle>Más opciones</SheetTitle>
              <SheetDescription>Sub-items adicionales del módulo</SheetDescription>
            </SheetHeader>
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="space-y-1">
              {overflowItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setOverflowOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400 font-medium"
                        : "text-foreground/80 hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════
   SECTION NAV — CRM detail page scroll navigation (with overflow handling)
   ════════════════════════════════════════════════════ */

function SectionNav({ items }: { items: BottomNavItem[] }) {
  const [activeSection, setActiveSection] = useState(items[0]?.key.replace('section-', '') || '');
  const isClickScrolling = useRef(false);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const MAX_VISIBLE = 4;

  // If the active section is in overflow, swap it into visible slots
  const visibleItems = useMemo(() => {
    const baseVisible = items.slice(0, MAX_VISIBLE);
    const overflow = items.slice(MAX_VISIBLE);
    const activeKey = `section-${activeSection}`;
    const activeInOverflow = overflow.findIndex((item) => item.key === activeKey);

    if (activeInOverflow >= 0) {
      // Replace the last visible item with the active overflow item
      const swapped = [...baseVisible];
      swapped[MAX_VISIBLE - 1] = overflow[activeInOverflow];
      return swapped;
    }
    return baseVisible;
  }, [items, activeSection]);

  const overflowItems = useMemo(() => {
    return items.filter((item) => !visibleItems.includes(item));
  }, [items, visibleItems]);

  const hasOverflow = items.length > MAX_VISIBLE;

  // IntersectionObserver to track active section
  useEffect(() => {
    const sectionIds = items.map((item) => item.href.replace('#', ''));
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;

        let maxRatio = 0;
        let maxKey = '';

        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxKey = entry.target.id.replace('section-', '');
          }
        }

        if (maxRatio < 0.1) {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              maxKey = entry.target.id.replace('section-', '');
              break;
            }
          }
        }

        if (maxKey) setActiveSection(maxKey);
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.1, 0.25, 0.5],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const handleClick = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (!el) return;

    isClickScrolling.current = true;
    setActiveSection(sectionId.replace('section-', ''));

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => {
      isClickScrolling.current = false;
    }, 800);
  }, []);

  return (
    <>
      {visibleItems.map((item) => {
        const sectionKey = item.key.replace('section-', '');
        const sectionId = item.href.replace('#', '');
        const isActive = activeSection === sectionKey;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => handleClick(sectionId)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] flex-1 px-1 py-1 transition-all active:scale-95",
              isActive ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {isActive && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
            )}
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium truncate max-w-full w-full text-center leading-tight">{item.label}</span>
          </button>
        );
      })}

      {hasOverflow && (
        <>
          <button
            type="button"
            onClick={() => setOverflowOpen(true)}
            className="relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1 active:scale-95 transition-all text-muted-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight">Más</span>
          </button>

          <Sheet open={overflowOpen} onOpenChange={setOverflowOpen}>
            <SheetContent side="bottom" className="max-h-[60vh] rounded-t-2xl px-4 pt-3 pb-6">
              <SheetHeader className="sr-only">
                <SheetTitle>Más secciones</SheetTitle>
                <SheetDescription>Secciones adicionales del registro</SheetDescription>
              </SheetHeader>
              <div className="flex justify-center mb-4">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="space-y-1">
                {overflowItems.map((item) => {
                  const sectionKey = item.key.replace('section-', '');
                  const sectionId = item.href.replace('#', '');
                  const isActive = activeSection === sectionKey;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        handleClick(sectionId);
                        setOverflowOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 w-full rounded-lg px-3 py-3 text-sm transition-colors",
                        isActive
                          ? "bg-emerald-500/10 text-emerald-400 font-medium"
                          : "text-foreground/80 hover:bg-muted/50"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </>
  );
}
