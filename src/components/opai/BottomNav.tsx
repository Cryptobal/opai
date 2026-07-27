'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SignOutDialog } from './SignOutDialog';
import {
  Home, Briefcase, Shield, Users, LayoutGrid,
  ChevronLeft, ChevronDown, MoreHorizontal,
  Landmark, Wallet, FolderOpen, FileBarChart, Clock,
  Settings, Monitor, Eye, Sun, Moon, User, LogOut,
  Check, Receipt, Calculator, FileText, SlidersHorizontal, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBottomNavItems, type BottomNavItem } from '@/lib/module-nav';
import { findActiveModule, pathMatchesNode } from '@/lib/nav/registry';
import { usePermissions } from '@/lib/permissions-context';
import { hasModuleAccess, canView, hasCapability } from '@/lib/permissions';
import { useTenantModules } from '@/contexts/TenantModulesContext';
import { useRoleSimulation } from '@/contexts/RoleSimulationContext';
import { ChatSidePanelContext } from '@/components/chat/ChatFloatingProvider';
import { RoleSwitcher } from '@/components/navbar/RoleSwitcher';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useTheme } from './ThemeProvider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { DEFAULT_SURFACE, type Surface } from '@/lib/surface';

/** Tracks BottomNav real height and exposes it as --bottom-nav-height CSS variable */
function useBottomNavHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      // Isla flotante: la altura reservada incluye el gap de 10px + un margen.
      document.documentElement.style.setProperty('--bottom-nav-height', `${el.offsetHeight + 12}px`);
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
  /** Superficie activa. En `productividad` solo se muestran hijos del portal. */
  surface?: Surface;
}

/* ── Main bottom nav items (configurable 4 + Más) ── */

interface MainNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  isDrawer?: boolean;
}

/** All available nav slots the user can pick from (max 4 shown + Más) */
const ALL_NAV_OPTIONS: MainNavItem[] = [
  { key: "home", href: "/hub", label: "Inicio", icon: Home },
  { key: "productividad", href: "/opai/agenda", label: "Prod.", icon: Sparkles },
  { key: "comercial", href: "/crm", label: "Comercial", icon: Briefcase },
  { key: "operaciones", href: "/ops", label: "Operaciones", icon: Shield },
  { key: "personas", href: "/personas/guardias", label: "Personas", icon: Users },
  { key: "finanzas", href: "/finanzas", label: "Finanzas", icon: Receipt },
  { key: "payroll", href: "/payroll", label: "Payroll", icon: Calculator },
  { key: "documentos", href: "/opai/documentos", label: "Docs", icon: FileText },
];

const MAS_ITEM: MainNavItem = { key: "mas", href: "#mas", label: "Más", icon: LayoutGrid, isDrawer: true };

const DEFAULT_NAV_KEYS = ["home", "comercial", "operaciones", "personas"];
const STORAGE_PREFIX = "opai-bottom-nav";

/* ── Generic bar order storage ── */

function getStoredOrder(context: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}-${context}`);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function saveOrder(context: string, keys: string[]) {
  try { localStorage.setItem(`${STORAGE_PREFIX}-${context}`, JSON.stringify(keys)); } catch { /* ignore */ }
}

/**
 * Reorders `items` based on stored user preference for `context`.
 * Stored keys come first (in stored order), then remaining items in original order.
 */
function applyStoredOrder<T extends { key: string }>(context: string, items: T[], maxVisible: number): { ordered: T[]; storedKeys: string[] | null } {
  const storedKeys = getStoredOrder(context);
  if (!storedKeys) return { ordered: items, storedKeys: null };

  // Items the user pinned (in stored order), filtered to only those still available
  const available = new Map(items.map((item) => [item.key, item]));
  const pinned: T[] = [];
  for (const key of storedKeys) {
    const item = available.get(key);
    if (item) {
      pinned.push(item);
      available.delete(key);
    }
  }
  // Remaining items keep their original relative order
  const rest = items.filter((item) => available.has(item.key));
  return { ordered: [...pinned, ...rest], storedKeys };
}

function useNavConfig() {
  const [navKeys, setNavKeys] = useState(DEFAULT_NAV_KEYS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setNavKeys(getStoredOrder("main") ?? DEFAULT_NAV_KEYS);
    setLoaded(true);
  }, []);

  const items: MainNavItem[] = useMemo(() => {
    const selected = navKeys
      .map((k: string) => ALL_NAV_OPTIONS.find((o) => o.key === k))
      .filter(Boolean) as MainNavItem[];
    return [...selected, MAS_ITEM];
  }, [navKeys]);

  const updateKeys = useCallback((keys: string[]) => {
    setNavKeys(keys);
    saveOrder("main", keys);
  }, []);

  return { items, navKeys, updateKeys, loaded };
}

/* ── Module route detection (is the user inside a specific module?) ── */

/** Mapea key del registry → context key legacy usado por MODULE_LABELS y
 *  el storage de orden (`opai-bottom-nav-<context>`). Mantiene backcompat
 *  con preferencias ya guardadas por usuarios. */
const REGISTRY_TO_CONTEXT: Record<string, string> = {
  hub: "hub",
  crm: "crm", ops: "ops", personas: "personas", payroll: "payroll",
  finance: "finanzas", config: "config", docs: "docs", reportes_dt: "reportes_dt",
  // Productividad (Correos · Agenda · Tareas · Agentes). Sin esta clave,
  // getActiveModule devolvía null en /opai/tareas, /opai/agenda y /crm/correos
  // → la isla renderizaba MainNav (pill "Comercial") en vez del sub-nav.
  productividad: "productividad",
};

/** Deriva el módulo activo del registry (findActiveModule = matchea NAV_MODULES
 *  top-level con pathMatchesNode, longest-href-wins → activePaths gratis).
 *  Reemplaza los prefijos hardcodeados que la fuente única vino a eliminar. */
function getActiveModule(pathname: string): string | null {
  const node = findActiveModule(pathname);
  if (!node) return null;
  return REGISTRY_TO_CONTEXT[node.key] ?? null;
}

/* ── Main export ── */

export function BottomNav({ userRole, surface = DEFAULT_SURFACE }: BottomNavProps) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { effectiveRole, effectivePermissions, isSimulating } = useRoleSimulation();
  const { enabledModules, featureFlags } = useTenantModules();
  const navRef = useRef<HTMLElement>(null);
  const navConfig = useNavConfig();
  // Instagram-like: al scrollear contenido hacia arriba se CONDENSÁ (achica),
  // no se desliza hacia abajo fuera de pantalla. El texto pasa bajo el glass.
  const condensed = useScrollDirection(60);
  useBottomNavHeight(navRef);

  // State override: when user taps back in ModuleSubNav, show MainNav without navigating
  const [forceMainNav, setForceMainNav] = useState(false);
  // Reset override when route changes (user tapped a MainNav item)
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      setForceMainNav(false);
    }
  }, [pathname]);

  if (!userRole || !pathname) return null;

  // Check if we're on a CPQ detail page (BottomNav hidden there — Phase 5)
  const isCpqDetail = /^\/crm\/cotizaciones\/[^/]+$/.test(pathname);
  if (isCpqDetail) return null;

  const activePerms = isSimulating ? effectivePermissions : permissions;
  const permsOrRole = activePerms.modules && Object.keys(activePerms.modules).length > 0
    ? activePerms
    : userRole;

  const isAdmin = effectiveRole === 'owner' || effectiveRole === 'admin';

  // Superficie Productividad: solo hijos del portal (sin MainNav ERP ni back).
  // Usamos un pathname canónico del nodo para obtener los children del registry
  // aunque el usuario esté viendo una ficha ERP con barra de retorno.
  if (surface === 'productividad') {
    const productividadItems = getBottomNavItems(
      '/opai/agenda',
      permsOrRole,
      enabledModules,
      isAdmin,
      featureFlags,
    );
    return (
      <nav
        ref={navRef}
        className="fixed left-3 right-3 z-40 lg:hidden pointer-events-none"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        }}
      >
        <div
          className={cn(
            "pointer-events-auto flex w-full items-end gap-2 origin-bottom",
            "motion-safe:transition-transform motion-safe:duration-[380ms]",
            "motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            condensed ? "scale-[0.86]" : "scale-100",
          )}
        >
          <div className="opai-glass-strong flex h-14 min-w-0 flex-1 items-center justify-around overflow-hidden px-1">
            <ModuleSubNav
              items={productividadItems}
              activeModule="productividad"
              pathname={pathname}
              onBack={() => {}}
              hideBack
            />
          </div>
          <OpaiOrb />
        </div>
      </nav>
    );
  }

  // Determine which mode to show.
  // CRM detail pages render their section nav as horizontal ChipTabs inside
  // EntityDetailLayout (like HubSpot / Salesforce). The bottom nav always
  // shows module-level navigation so the user can jump between entity lists.
  const activeModule = getActiveModule(pathname);
  const moduleItems = activeModule ? getBottomNavItems(pathname, permsOrRole, enabledModules, isAdmin, featureFlags) : [];
  const isInModule = !forceMainNav && !!activeModule && moduleItems.length > 0;

  return (
    <nav
      ref={navRef}
      className="fixed left-3 right-3 z-40 lg:hidden pointer-events-none"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
      }}
    >
      {/* Escala suave desde el borde inferior (estilo Instagram). Solo íconos —
          sin labels — para que no haya reflow ni saltos al condensar. */}
      <div
        className={cn(
          "pointer-events-auto flex w-full items-end gap-2 origin-bottom",
          "motion-safe:transition-transform motion-safe:duration-[380ms]",
          "motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          condensed ? "scale-[0.86]" : "scale-100",
        )}
      >
        <div className="opai-glass-strong flex h-14 min-w-0 flex-1 items-center justify-around overflow-hidden px-1">
          {isInModule ? (
            <ModuleSubNav
              items={moduleItems}
              activeModule={activeModule!}
              pathname={pathname}
              onBack={() => setForceMainNav(true)}
            />
          ) : (
            <MainNav pathname={pathname} userRole={userRole} navConfig={navConfig} />
          )}
        </div>
        <OpaiOrb />
      </div>
    </nav>
  );
}

/* ════════════════════════════════════════════════════
   ORBE OPAI — botón glass-teal integrado a la derecha de la isla.
   Reemplaza el FAB del widget AI en mobile (desktop mantiene su panel).
   Al tocarlo emite `opai-ai-open`; el widget lo escucha y se abre.
   ════════════════════════════════════════════════════ */

function OpaiOrb() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("opai-ai-open"))}
      aria-label="Abrir OPAI Intelligence"
      className="opai-orb relative h-14 w-14 shrink-0 overflow-hidden rounded-full active:scale-95"
    >
      <span aria-hidden className="opai-orb-sweep absolute inset-0 rounded-full" />
      <Sparkles className="relative mx-auto h-5 w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
    </button>
  );
}

/* ════════════════════════════════════════════════════
   MAIN NAV — 5 fixed items (Inicio, Comercial, Operaciones, Personas, Más)
   ════════════════════════════════════════════════════ */

function MainNav({
  pathname,
  userRole,
  navConfig,
}: {
  pathname: string;
  userRole: string;
  navConfig: ReturnType<typeof useNavConfig>;
}) {
  const [masOpen, setMasOpen] = useState(false);
  const itemClass =
    "relative flex min-h-11 min-w-11 flex-1 items-center justify-center active:scale-95 transition-transform";

  return (
    <>
      {navConfig.items.map((item) => {
        if (item.isDrawer) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setMasOpen(true)}
              aria-label={item.label}
              className={cn(itemClass, "text-muted-foreground")}
            >
              <item.icon className="h-[22px] w-[22px]" />
            </button>
          );
        }

        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-label={item.label}
            className={cn(itemClass, isActive ? "text-primary" : "text-muted-foreground")}
          >
            {isActive && <span aria-hidden className="opai-nav-pill opai-nav-pill-icon" />}
            <item.icon className="relative h-[22px] w-[22px]" />
          </Link>
        );
      })}

      <MasDrawer open={masOpen} onOpenChange={setMasOpen} userRole={userRole} navConfig={navConfig} />
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

function MasDrawer({ open, onOpenChange, userRole, navConfig }: { open: boolean; onOpenChange: (v: boolean) => void; userRole: string; navConfig: ReturnType<typeof useNavConfig> }) {
  const permissions = usePermissions();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const isAdmin = userRole === 'owner' || userRole === 'admin';

  const modules: MasModuleItem[] = useMemo(() => [
    { key: "productividad", href: "/opai/agenda", label: "Productividad", icon: Sparkles, color: "text-primary", show: hasModuleAccess(permissions, "productividad") },
    { key: "finanzas", href: "/finanzas", label: "Finanzas", icon: Landmark, color: "text-status-warn-fg", show: hasModuleAccess(permissions, "finance") },
    { key: "payroll", href: "/payroll", label: "Payroll", icon: Wallet, color: "text-tint-violet-fg", show: hasModuleAccess(permissions, "payroll") },
    { key: "documentos", href: "/opai/documentos", label: "Documentos", icon: FolderOpen, color: "text-status-info-fg", show: hasModuleAccess(permissions, "docs") },
    { key: "reportes-dt", href: "/reportes/dt", label: "Reportes DT", icon: FileBarChart, color: "text-status-danger-fg", show: canView(permissions, "reportes_dt") },
  ], [permissions]);

  const tools: MasModuleItem[] = useMemo(() => [
    { key: "config", href: "/opai/configuracion", label: "Configuración", icon: Settings, color: "text-zinc-400", show: isAdmin },
    { key: "portales", href: "/portales", label: "Portales", icon: Monitor, color: "text-status-info-fg", show: isAdmin },
    { key: "simular-rol", label: "Simular Rol", icon: Eye, color: "text-status-info-fg", show: isAdmin, action: 'role-switcher' },
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
              {/* Personalizar barra (collapsible) */}
              <BarCustomizer
                allOptions={ALL_NAV_OPTIONS}
                selectedKeys={navConfig.navKeys}
                onUpdate={navConfig.updateKeys}
                maxVisible={4}
                allowDeselect
              />

              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-muted/50 active:scale-[0.98] transition-all"
              >
                {theme === 'dark' ? <Moon className="h-4.5 w-4.5 text-status-info-fg" /> : <Sun className="h-4.5 w-4.5 text-status-warn-fg" />}
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
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm text-status-danger-fg hover:bg-status-danger-soft active:scale-[0.98] transition-all"
              >
                <LogOut className="h-4.5 w-4.5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SignOutDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog} />
    </>
  );
}

/* ════════════════════════════════════════════════════
   GENERIC BAR CUSTOMIZER — reusable across main nav & module sub-navs
   ════════════════════════════════════════════════════ */

interface BarCustomizerProps {
  /** All items available for this bar */
  allOptions: { key: string; label: string; icon: LucideIcon }[];
  /** Currently selected/ordered keys (first N are visible) */
  selectedKeys: string[];
  /** Callback when user changes the order */
  onUpdate: (keys: string[]) => void;
  /** Max items visible in the bar (default 4) */
  maxVisible?: number;
  /** Allow deselecting items below maxVisible (main nav mode) */
  allowDeselect?: boolean;
}

function BarCustomizer({ allOptions, selectedKeys, onUpdate, maxVisible = 4, allowDeselect = false }: BarCustomizerProps) {
  const [open, setOpen] = useState(false);

  const toggleItem = (key: string) => {
    if (!allowDeselect) return; // module bars only reorder, all items always present
    if (selectedKeys.includes(key)) {
      if (selectedKeys.length <= 2) return;
      onUpdate(selectedKeys.filter((k: string) => k !== key));
    } else {
      if (selectedKeys.length >= maxVisible) return;
      onUpdate([...selectedKeys, key]);
    }
  };

  const moveItem = (key: string, dir: -1 | 1) => {
    const idx = selectedKeys.indexOf(key);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= selectedKeys.length) return;
    const next = [...selectedKeys];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onUpdate(next);
  };

  // Build display list: selected items in user order first, then unselected
  const sortedOptions = useMemo(() => {
    const selected = selectedKeys
      .map((k: string) => allOptions.find((o) => o.key === k))
      .filter(Boolean) as typeof allOptions;
    const unselected = allOptions.filter((o) => !selectedKeys.includes(o.key));
    return [...selected, ...unselected];
  }, [allOptions, selectedKeys]);

  return (
    <div>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v: boolean) => !v)}
        className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-muted/50 active:scale-[0.98] transition-all"
      >
        <SlidersHorizontal className="h-4.5 w-4.5 text-status-ok-fg" />
        <span className="flex-1 text-left">Personalizar barra</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      {/* Collapsible options */}
      {open && (
        <div className="mt-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {sortedOptions.map((opt: { key: string; label: string; icon: LucideIcon }) => {
            const isSelected = selectedKeys.includes(opt.key);
            const idx = selectedKeys.indexOf(opt.key);
            const isVisible = isSelected && idx < maxVisible;
            const Icon = opt.icon;
            return (
              <div
                key={opt.key}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  isVisible ? "bg-status-ok-soft" : isSelected ? "bg-muted/30" : "bg-transparent"
                )}
              >
                {allowDeselect ? (
                  <button
                    type="button"
                    onClick={() => toggleItem(opt.key)}
                    className={cn(
                      "flex items-center justify-center w-5 h-5 rounded border transition-colors",
                      isSelected
                        ? "bg-status-ok border-status-ok-border text-white"
                        : "border-border text-transparent hover:border-muted-foreground"
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                ) : (
                  <span className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0",
                    isVisible ? "bg-status-ok-soft text-status-ok-fg" : "bg-muted text-muted-foreground"
                  )}>
                    {idx + 1}
                  </span>
                )}
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-foreground/80">{opt.label}</span>
                {isSelected && (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveItem(opt.key, -1)}
                      disabled={idx === 0}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(opt.key, 1)}
                      disabled={idx === selectedKeys.length - 1}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 -rotate-90" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            {allowDeselect
              ? `Selecciona 2–${maxVisible} accesos directos`
              : `Los primeros ${maxVisible} se muestran en la barra`
            }
          </p>
        </div>
      )}
    </div>
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
  productividad: "Prod.",
};

function ModuleSubNav({
  items,
  activeModule,
  pathname,
  onBack,
  hideBack = false,
}: {
  items: BottomNavItem[];
  activeModule: string;
  pathname: string;
  onBack: () => void;
  /** Superficie Productividad: sin botón de vuelta al MainNav ERP. */
  hideBack?: boolean;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const chatCtx = useContext(ChatSidePanelContext);

  // Apply stored user order for this module
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() =>
    getStoredOrder(activeModule) ?? items.map((i) => i.key)
  );

  // Re-sync when items change (permission-based filtering)
  useEffect(() => {
    const stored = getStoredOrder(activeModule);
    const available = new Set(items.map((i) => i.key));
    if (stored) {
      const valid = stored.filter((k: string) => available.has(k));
      const newKeys = items.filter((i) => !valid.includes(i.key)).map((i) => i.key);
      // Insertar ítems nuevos (p. ej. ATS añadido al producto) junto a ops-ats, no al final
      let merged = [...valid];
      if (newKeys.length > 0) {
        const atsIdx = merged.indexOf("ops-ats");
        if (atsIdx >= 0) {
          merged = [...merged.slice(0, atsIdx + 1), ...newKeys, ...merged.slice(atsIdx + 1)];
        } else {
          merged = [...newKeys, ...merged];
        }
      }
      setOrderedKeys(merged);
    } else {
      setOrderedKeys(items.map((i) => i.key));
    }
  }, [activeModule, items]);

  const orderedItems = useMemo(() => {
    const map = new Map(items.map((i) => [i.key, i]));
    const ordered = orderedKeys
      .map((k: string) => map.get(k))
      .filter(Boolean) as BottomNavItem[];
    // Add any items not in orderedKeys
    const rest = items.filter((i) => !orderedKeys.includes(i.key));
    return [...ordered, ...rest];
  }, [items, orderedKeys]);

  const handleUpdateOrder = useCallback((keys: string[]) => {
    setOrderedKeys(keys);
    saveOrder(activeModule, keys);
  }, [activeModule]);

  // Max 4 visible items + back button + optional more button
  const MAX_VISIBLE = 4;
  const visibleItems = orderedItems.slice(0, MAX_VISIBLE);
  const overflowItems = orderedItems.slice(MAX_VISIBLE);
  const hasOverflow = overflowItems.length > 0 || items.length > MAX_VISIBLE;

  // Longest-prefix-wins matching across the items in this module so a deep
  // route like /finanzas/reportes/eerr resaltea "EERR" en vez de "Dashboard"
  // (que tiene exactMatch:true sobre /finanzas/reportes). Usa el matcher
  // canónico del registry (soporta activePaths).
  const activeHref = orderedItems
    .filter((i) => pathMatchesNode(pathname, i))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const slotClass =
    "relative flex min-h-11 min-w-11 flex-1 items-center justify-center active:scale-95 transition-transform";

  return (
    <>
      {/* Back button — oculto en superficie Productividad (no hay MainNav ERP). */}
      {!hideBack && (
        <button
          type="button"
          onClick={onBack}
          className={cn(slotClass, "mr-0.5 max-w-12 shrink-0 text-muted-foreground border-r border-white/10")}
          aria-label={MODULE_LABELS[activeModule] ? `Volver a ${MODULE_LABELS[activeModule]}` : "Volver"}
        >
          <ChevronLeft className="h-[22px] w-[22px]" />
        </button>
      )}

      {/* Visible sub-items */}
      {visibleItems.map((item) => {
        const isChatToggle = item.key === 'chat';
        const isActive = isChatToggle
          ? !!chatCtx?.isPanelOpen
          : item.href === activeHref;
        const Icon = item.icon;

        const content = (
          <>
            {isActive && <span aria-hidden className="opai-nav-pill opai-nav-pill-icon" />}
            <Icon className="relative h-[22px] w-[22px]" />
          </>
        );

        const itemClass = cn(
          slotClass,
          isActive ? "text-primary" : "text-muted-foreground",
        );

        if (isChatToggle) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => chatCtx?.togglePanel()}
              aria-label={item.label}
              className={itemClass}
            >
              {content}
            </button>
          );
        }

        return (
          <Link key={item.key} href={item.href} aria-label={item.label} className={itemClass}>
            {content}
          </Link>
        );
      })}

      {/* Overflow / Más button — always visible for customizer access */}
      <button
        type="button"
        onClick={() => setOverflowOpen(true)}
        aria-label="Más opciones"
        className={cn(slotClass, "max-w-12 shrink-0 text-muted-foreground")}
      >
        <MoreHorizontal className="h-[22px] w-[22px]" />
      </button>

      {/* Overflow + customizer sheet */}
      <Sheet open={overflowOpen} onOpenChange={setOverflowOpen}>
        <SheetContent side="bottom" className="max-h-[60vh] rounded-t-2xl px-4 pt-3 pb-6">
          <SheetHeader className="sr-only">
            <SheetTitle>Más opciones</SheetTitle>
            <SheetDescription>Sub-items y personalización del módulo</SheetDescription>
          </SheetHeader>
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Overflow navigation items */}
          {overflowItems.length > 0 && (
            <div className="space-y-1 mb-4">
              {overflowItems.map((item: BottomNavItem) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setOverflowOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                      isActive
                        ? "bg-status-ok-soft text-status-ok-fg font-medium"
                        : "text-foreground/80 hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Customizer for this module's bar */}
          <BarCustomizer
            allOptions={items}
            selectedKeys={orderedKeys}
            onUpdate={handleUpdateOrder}
            maxVisible={MAX_VISIBLE}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
