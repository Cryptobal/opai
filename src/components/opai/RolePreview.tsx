'use client';

/**
 * RolePreview — Previsualiza qué verá un rol con un set dado de permisos.
 *
 * Se compone de dos paneles:
 * - RolePreviewSidebar:  el sidebar tal cual lo verá el rol simulado
 * - RolePreviewConfig:   los items de /opai/configuracion accesibles vs no
 *
 * No depende de la sesión: recibe los permisos por prop y los renderiza
 * usando `buildNavItems` (mismo código que el sidebar real).
 */

import { ChevronRight, Settings, Lock } from 'lucide-react';
import {
  Building, Users, ShieldCheck, Plug, Bell, Bot, Sparkles,
  ClipboardCheck, FileText, PenLine, FolderTree, TrendingUp,
  DollarSign, Calculator, ClipboardList, Ticket, Receipt,
  Trophy, Siren, Briefcase, Shield, Brain,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { canView, type RolePermissions } from '@/lib/permissions';
import { buildNavItems } from '@/components/opai/role-nav-builder';
import { useTenantModules } from '@/contexts/TenantModulesContext';

const ICON_MAP: Record<string, LucideIcon> = {
  building: Building, users: Users, 'shield-check': ShieldCheck, plug: Plug,
  bell: Bell, bot: Bot, sparkles: Sparkles, 'clipboard-check': ClipboardCheck,
  'file-text': FileText, 'pen-line': PenLine, 'folder-tree': FolderTree,
  'trending-up': TrendingUp, 'dollar-sign': DollarSign, calculator: Calculator,
  'clipboard-list': ClipboardList, ticket: Ticket, receipt: Receipt,
  trophy: Trophy, siren: Siren, briefcase: Briefcase, shield: Shield,
  brain: Brain,
};

interface PreviewConfigItem {
  submodule: string;
  title: string;
  icon: string;
  adminOnly?: boolean;
}

interface PreviewConfigSection {
  key: string;
  title: string;
  items: PreviewConfigItem[];
}

// Mismas secciones que /opai/configuracion (mantener sincronizado)
const CONFIG_SECTIONS: PreviewConfigSection[] = [
  {
    key: 'general', title: 'General',
    items: [
      { submodule: 'empresa', title: 'Datos de la Empresa', icon: 'building', adminOnly: true },
      { submodule: 'usuarios', title: 'Usuarios', icon: 'users' },
      { submodule: 'roles', title: 'Roles y Permisos', icon: 'shield-check', adminOnly: true },
      { submodule: 'grupos', title: 'Grupos', icon: 'users' },
      { submodule: 'integraciones', title: 'Integraciones', icon: 'plug' },
      { submodule: 'notificaciones', title: 'Notificaciones', icon: 'bell' },
      { submodule: 'asistente_ia', title: 'Asistente IA', icon: 'bot', adminOnly: true },
      { submodule: 'auditoria', title: 'Auditoría', icon: 'clipboard-check', adminOnly: true },
      { submodule: 'documentos_operacionales', title: 'Documentos Operacionales', icon: 'file-text', adminOnly: true },
      { submodule: 'mi_plan', title: 'Mi Plan', icon: 'credit-card', adminOnly: true },
    ],
  },
  {
    key: 'correos-documentos', title: 'Correos y Documentos',
    items: [
      { submodule: 'firmas', title: 'Firmas', icon: 'pen-line' },
      { submodule: 'categorias', title: 'Categorías de plantillas', icon: 'folder-tree' },
    ],
  },
  {
    key: 'compliance', title: 'Compliance',
    items: [
      { submodule: 'cumplimiento', title: 'Cumplimiento (Ley 21.719)', icon: 'shield-check', adminOnly: true },
    ],
  },
  {
    key: 'modulos', title: 'Módulos',
    items: [
      { submodule: 'crm', title: 'CRM', icon: 'trending-up' },
      { submodule: 'cpq', title: 'Cotizaciones (CPQ)', icon: 'dollar-sign' },
      { submodule: 'payroll', title: 'Payroll', icon: 'calculator' },
      { submodule: 'ops', title: 'Operaciones', icon: 'clipboard-list' },
      { submodule: 'tipos_ticket', title: 'Tipos de Ticket', icon: 'ticket' },
      { submodule: 'finanzas', title: 'Finanzas', icon: 'receipt' },
      { submodule: 'gamificacion', title: 'Gamificación', icon: 'trophy', adminOnly: true },
      { submodule: 'alertas_cobertura', title: 'Alertas de Cobertura', icon: 'siren' },
      { submodule: 'ats', title: 'ATS — Reclutamiento', icon: 'briefcase' },
      { submodule: 'psicolaboral', title: 'Psicolaboral', icon: 'brain', adminOnly: true },
    ],
  },
];

// ═══════════════════════════════════════════
//  Sidebar mock
// ═══════════════════════════════════════════

interface RolePreviewSidebarProps {
  permissions: RolePermissions;
  isAdminRole: boolean;
}

export function RolePreviewSidebar({ permissions, isAdminRole }: RolePreviewSidebarProps) {
  const { isModuleEnabled } = useTenantModules();
  const navItems = buildNavItems({
    permissions,
    isAdmin: isAdminRole,
    isComplianceVisible: isAdminRole,
    isModuleEnabled,
  });

  const visibleItems = navItems.filter((i) => i.show !== false);
  const hiddenItems = navItems.filter((i) => i.show === false);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sidebar — vista del rol
        </p>
      </div>
      <div className="p-2 space-y-0.5">
        {visibleItems.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/70">
            Este rol no tiene acceso a ningún módulo del sidebar.
          </p>
        )}
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const visibleChildren = (item.children ?? []).filter(Boolean);
          return (
            <div key={item.href} className="rounded-md">
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-foreground/90 bg-background/50 border border-transparent">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{item.label}</span>
                {visibleChildren.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">
                    {visibleChildren.length} sub
                  </span>
                )}
              </div>
              {visibleChildren.length > 0 && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {visibleChildren.map((sub) => (
                    <div
                      key={sub.href}
                      className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground/80"
                    >
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                      <span className="truncate">{sub.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hiddenItems.length > 0 && (
        <div className="border-t border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            No accesibles
          </p>
          <div className="flex flex-wrap gap-1">
            {hiddenItems.map((item) => (
              <span
                key={item.href}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 bg-background/50 border border-border/40 line-through"
              >
                <Lock className="h-2.5 w-2.5" />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
//  Config mock
// ═══════════════════════════════════════════

interface RolePreviewConfigProps {
  permissions: RolePermissions;
  isAdminRole: boolean;
}

export function RolePreviewConfig({ permissions, isAdminRole }: RolePreviewConfigProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          /opai/configuracion — vista del rol
        </p>
      </div>
      <div className="p-3 space-y-3">
        {CONFIG_SECTIONS.map((section) => {
          const items = section.items.map((item) => ({
            ...item,
            visible: canView(permissions, 'config', item.submodule),
          }));
          const visible = items.filter((i) => i.visible);
          const hidden = items.filter((i) => !i.visible);

          return (
            <div key={section.key}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                {section.title}{' '}
                <span className="text-muted-foreground/50">
                  ({visible.length}/{items.length})
                </span>
              </p>
              <div className="rounded-md border border-border/50 bg-background/40 divide-y divide-border/40">
                {items.map((item) => {
                  const Icon = ICON_MAP[item.icon] ?? Settings;
                  return (
                    <div
                      key={item.submodule}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5',
                        !item.visible && 'opacity-40',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span
                        className={cn(
                          'flex-1 truncate text-xs',
                          !item.visible && 'line-through',
                        )}
                      >
                        {item.title}
                      </span>
                      {item.adminOnly && (
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 shrink-0">
                          Admin
                        </span>
                      )}
                      {!item.visible && (
                        <Lock className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                      )}
                      {item.visible && (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                      )}
                    </div>
                  );
                })}
              </div>
              {hidden.length > 0 && visible.length === 0 && (
                <p className="text-[10px] text-muted-foreground/60 mt-1 px-1">
                  Sin acceso a esta sección
                </p>
              )}
            </div>
          );
        })}
        {!isAdminRole && (
          <p className="text-[10px] text-muted-foreground/60 px-1">
            Las páginas marcadas con <strong className="text-amber-500">Admin</strong> requieren rol owner/admin además del permiso de submódulo.
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Wrapper combinado (ambos paneles lado a lado)
// ═══════════════════════════════════════════

interface RolePreviewProps {
  permissions: RolePermissions;
  isAdminRole: boolean;
}

export function RolePreview({ permissions, isAdminRole }: RolePreviewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <RolePreviewSidebar permissions={permissions} isAdminRole={isAdminRole} />
      <RolePreviewConfig permissions={permissions} isAdminRole={isAdminRole} />
    </div>
  );
}
