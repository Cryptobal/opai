'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Building2,
  Grid3x3,
  Calculator,
  Activity,
  Receipt,
  Users,
  MapPin,
  TrendingUp,
  Contact,
  DollarSign,
  CalendarDays,
  Fingerprint,
  Route,
  Ticket,
  FolderOpen,
  Wallet,
  BarChart3,
  User,
  ClipboardCheck,
  Landmark,
  Package,
  BookText,
  Monitor,
  Shield,
  Trophy,
  ScanLine,
  UserRoundCheck,
  Bell,
  FileBarChart,
  Sparkles,
  Siren,
  Briefcase,
} from 'lucide-react';
import { AppShell, AppSidebar, type NavItem } from '@/components/opai';
import { type RolePermissions, hasModuleAccess, canView, canViewInstallations, hasCapability } from '@/lib/permissions';
import { RoleSimulationProvider, useRoleSimulation } from '@/contexts/RoleSimulationContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { useTenantModules } from '@/contexts/TenantModulesContext';
import { ChatSidePanelProvider } from '@/components/chat/ChatFloatingProvider';
import { PushPermissionPrompt } from '@/components/pwa/PushPermissionPrompt';
import { InAppNotificationProvider } from '@/components/notifications/InAppNotificationProvider';
import { PanicAlertProvider } from '@/components/ops/PanicAlertProvider';

interface AppLayoutClientProps {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole: string;
  permissions: RolePermissions;
  currentUserId?: string;
  tenantId?: string;
}

export function AppLayoutClient(props: AppLayoutClientProps) {
  return (
    <RoleSimulationProvider realRole={props.userRole} realPermissions={props.permissions}>
      <NotificationProvider>
        <AppLayoutClientInner {...props} />
      </NotificationProvider>
    </RoleSimulationProvider>
  );
}

function AppLayoutClientInner({
  children,
  userName,
  userEmail,
  tenantId,
  userRole,
  permissions: realPermissions,
  currentUserId,
}: AppLayoutClientProps) {
  const { isSimulating, effectiveRole, effectivePermissions } = useRoleSimulation();
  // Use simulated permissions when active, otherwise real permissions
  const permissions = isSimulating ? effectivePermissions : realPermissions;
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const { isModuleEnabled } = useTenantModules();

  // Doble check: permiso de rol + módulo del tenant
  const canAccessModule = (roleCheck: boolean, ...moduleKeys: string[]) => {
    if (!roleCheck) return false;
    if (moduleKeys.length === 0) return true; // módulo core, siempre visible
    return moduleKeys.some(key => isModuleEnabled(key));
  };
  const [unreadMentionNotesCount, setUnreadMentionNotesCount] = useState(0);
  const [notesByModule, setNotesByModule] = useState<Record<string, number>>({});
  const [activityUnreadTotal, setActivityUnreadTotal] = useState(0);

  const fetchOtherCounters = useCallback(() => {
    Promise.all([
      fetch('/api/notifications?limit=1&types=mention,mention_direct,mention_group').then((r) => r.json()),
      fetch('/api/notes/unread-counts', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([noteData, unreadCounts]) => {
        if (noteData?.success && typeof noteData?.meta?.unreadCount === 'number') {
          setUnreadMentionNotesCount(noteData.meta.unreadCount);
        }
        if (unreadCounts?.success && unreadCounts?.data?.byModule) {
          setNotesByModule(unreadCounts.data.byModule);
          setActivityUnreadTotal(typeof unreadCounts.data.total === 'number' ? unreadCounts.data.total : 0);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchOtherCounters();
    const interval = setInterval(fetchOtherCounters, 30000);
    const onRefresh = () => fetchOtherCounters();
    window.addEventListener('opai-note-seen', onRefresh as EventListener);
    return () => {
      clearInterval(interval);
      window.removeEventListener('opai-note-seen', onRefresh as EventListener);
    };
  }, [fetchOtherCounters]);

  // Compute per-module unread note totals for parent sidebar badges
  const crmNotesBadge = (notesByModule.account || 0) + (notesByModule.contact || 0) + (notesByModule.deal || 0) + (notesByModule.installation || 0) + (notesByModule.lead || 0) + (notesByModule.quotation || 0);
  const opsNotesBadge = (notesByModule.ticket || 0) + (notesByModule.operation || 0) + (notesByModule.supervision_visit || 0) + (notesByModule.marcacion || 0);
  const payrollNotesBadge = notesByModule.payroll_record || 0;
  const docsNotesBadge = notesByModule.document || 0;
  const financeNotesBadge = notesByModule.rendicion || 0;
  const personasNotesBadge = notesByModule.guard || 0;

  const navItems: NavItem[] = useMemo(() => [
    {
      href: '/hub',
      label: 'Inicio',
      icon: Grid3x3,
      show: canAccessModule(hasModuleAccess(permissions, 'hub')),
    },
    {
      href: '/crm',
      label: 'Comercial',
      icon: TrendingUp,
      show: canAccessModule(hasModuleAccess(permissions, 'crm'), 'crm'),
      badge: crmNotesBadge || unreadMentionNotesCount,
      children: [
        canView(permissions, 'crm', 'leads') && { href: '/crm/leads', label: 'Leads', icon: Users, badge: notesByModule.lead },
        canView(permissions, 'crm', 'accounts') && { href: '/crm/accounts', label: 'Cuentas', icon: Building2, badge: notesByModule.account },
        canView(permissions, 'crm', 'deals') && { href: '/crm/deals', label: 'Negocios', icon: TrendingUp, badge: notesByModule.deal },
        canView(permissions, 'crm', 'contacts') && { href: '/crm/contacts', label: 'Contactos', icon: Contact, badge: notesByModule.contact },
        canView(permissions, 'crm', 'quotes') && isModuleEnabled('cpq') && { href: '/crm/cotizaciones', label: 'Cotizaciones', icon: DollarSign, badge: notesByModule.quotation },
        canView(permissions, 'crm', 'leads') && { href: '/crm/prospecting', label: 'Prospección', icon: Sparkles },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/ops',
      label: 'Operaciones',
      icon: Activity,
      show: canAccessModule(hasModuleAccess(permissions, 'ops')),
      badge: opsNotesBadge,
      children: [
        // ── Subgrupo Pautas (core) ──
        (canView(permissions, 'ops', 'pauta_mensual') || canView(permissions, 'ops', 'pauta_diaria') || canView(permissions, 'ops', 'turnos_extra') || canView(permissions, 'ops', 'ppc')) && {
          href: '/ops/pautas',
          label: 'Pautas',
          icon: CalendarDays,
          badge: notesByModule.marcacion,
        },
        // ── Ítems individuales ──
        canViewInstallations(permissions) && { href: '/crm/installations', label: 'Instalaciones', icon: MapPin, badge: notesByModule.installation },
        canView(permissions, 'ops', 'supervision') && isModuleEnabled('ops_supervision') && { href: '/ops/supervision', label: 'Supervisión', icon: ClipboardCheck, badge: notesByModule.supervision_visit },
        canView(permissions, 'ops', 'tickets') && { href: '/ops/tickets', label: 'Tickets', icon: Ticket, badge: notesByModule.ticket },
        canView(permissions, 'ops', 'rondas') && isModuleEnabled('ops_rondas') && { href: '/ops/rondas', label: 'Rondas', icon: Route },
        canView(permissions, 'ops', 'alertas_cobertura') && isModuleEnabled('alertas_cobertura') && { href: '/ops/alertas-cobertura', label: 'Alertas Cobertura', icon: Siren },
        canView(permissions, 'ops', 'ats') && isModuleEnabled('ats') && { href: '/ops/ats', label: 'ATS — Reclutamiento', icon: Briefcase },
        canView(permissions, 'ops', 'inventario') && isModuleEnabled('ops_inventario') && { href: '/ops/inventario', label: 'Inventario', icon: Package },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/personas/guardias',
      label: 'Personas',
      icon: User,
      show: canAccessModule(hasModuleAccess(permissions, 'ops')),
      badge: personasNotesBadge,
      children: [
        { href: '/personas/guardias', label: 'Listado', icon: User, badge: notesByModule.guard },
        isModuleEnabled('ops_onboarding') && { href: '/personas/onboarding', label: 'Onboarding', icon: UserRoundCheck },
        { href: '/personas/comunicaciones', label: 'Comunicaciones', icon: Bell },
        { href: '/personas/guardias/sueldos-rut', label: 'Sueldos por RUT', icon: DollarSign },
        canView(permissions, 'ops', 'gamificacion') && isModuleEnabled('gamificacion') && { href: '/personas/gamificacion', label: 'Gamificación', icon: Trophy },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/payroll',
      label: 'Payroll',
      icon: Wallet,
      show: canAccessModule(hasModuleAccess(permissions, 'payroll'), 'payroll'),
      badge: payrollNotesBadge,
      children: [
        { href: '/payroll/periodos', label: 'Períodos de Pago', icon: CalendarDays, badge: notesByModule.payroll_record },
        { href: '/payroll/anticipos', label: 'Anticipos', icon: Wallet },
        { href: '/payroll/simulator', label: 'Simulador', icon: Calculator },
        { href: '/payroll/parameters', label: 'Parámetros', icon: FileText },
      ],
    },
    {
      href: '/finanzas',
      label: 'Finanzas',
      icon: Landmark,
      show: canAccessModule(hasModuleAccess(permissions, 'finance'), 'finanzas'),
      badge: financeNotesBadge,
      children: [
        (canView(permissions, 'finance', 'reportes') || hasCapability(permissions, 'rendicion_view_all')) && { href: '/finanzas', label: 'Inicio', icon: Grid3x3 },
        canView(permissions, 'finance', 'rendiciones') && { href: '/finanzas/rendiciones', label: 'Rendiciones', icon: Receipt, badge: notesByModule.rendicion },
        canView(permissions, 'finance', 'facturacion') && { href: '/finanzas/facturacion', label: 'Ventas', icon: FileText },
        canView(permissions, 'finance', 'proveedores') && { href: '/finanzas/proveedores', label: 'Compras', icon: Building2 },
        canView(permissions, 'finance', 'contabilidad') && { href: '/finanzas/bancos', label: 'Banca', icon: Landmark },
        canView(permissions, 'finance', 'contabilidad') && { href: '/finanzas/contabilidad', label: 'Contabilidad', icon: BookText },
        canView(permissions, 'finance', 'reportes') && { href: '/finanzas/reportes', label: 'Informes', icon: BarChart3 },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/opai/inicio',
      label: 'Documentos',
      icon: FolderOpen,
      show: canAccessModule(hasModuleAccess(permissions, 'docs'), 'documentos'),
      badge: docsNotesBadge,
      children: [
        { href: '/opai/inicio', label: 'Envíos', icon: FileText },
        { href: '/opai/documentos', label: 'Gestión', icon: FolderOpen, badge: notesByModule.document },
      ],
    },
    {
      href: '/reportes/dt',
      label: 'Reportes DT',
      icon: FileBarChart,
      show: canAccessModule(canView(permissions, 'reportes_dt'), 'reportes_dt'),
      children: [
        { href: '/reportes/dt/asistencia-diaria', label: 'Asistencia Diaria', icon: FileBarChart },
        { href: '/reportes/dt/jornada-diaria', label: 'Jornada Diaria', icon: FileBarChart },
        { href: '/reportes/dt/domingos-festivos', label: 'Domingos y Festivos', icon: FileBarChart },
        { href: '/reportes/dt/modificaciones-turnos', label: 'Modificaciones', icon: FileBarChart },
      ],
    },
    // ── Portales (solo owner/admin) ──
    {
      href: '/portales',
      label: 'Portales',
      icon: Monitor,
      show: isAdmin,
      children: [
        isModuleEnabled('portal_guardia') && { href: '/portal/guardia', label: 'Portal Guardia', icon: Shield },
        isModuleEnabled('ops_rondas') && { href: '/portal/rondas', label: 'Portal Rondas', icon: Route },
        isModuleEnabled('portal_cliente') && { href: '/portal/cliente', label: 'Portal Cliente', icon: Users },
        isModuleEnabled('portal_supervisor') && { href: '/portal/supervisor', label: 'Portal Supervisor', icon: ClipboardCheck },
        isModuleEnabled('portal_marcacion') && { href: '/portal/marcacion', label: 'Portal Marcación', icon: Fingerprint },
        isModuleEnabled('control_acceso') && { href: '/portal/acceso', label: 'Control de Acceso', icon: ScanLine },
      ].filter(Boolean) as NavItem['children'],
    },
  ], [permissions, isAdmin, isModuleEnabled, unreadMentionNotesCount, notesByModule, crmNotesBadge, opsNotesBadge, payrollNotesBadge, docsNotesBadge, financeNotesBadge, personasNotesBadge]);

  return (
    <InAppNotificationProvider
      pusherKey={process.env.NEXT_PUBLIC_PUSHER_KEY!}
      pusherCluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER!}
      pusherAuthEndpoint="/api/chat/pusher/auth"
      tenantId={tenantId ?? ""}
      userType="ADMIN"
      userId={currentUserId ?? ""}
      chatUrlPrefix="/chat"
    >
      <PanicAlertProvider tenantId={tenantId ?? ""}>
      <ChatSidePanelProvider currentUserId={currentUserId ?? ''} userRole={userRole}>
        <AppShell
          sidebar={
            <AppSidebar
              navItems={navItems}
              userName={userName ?? undefined}
              userEmail={userEmail ?? undefined}
            />
          }
          userName={userName ?? undefined}
          userEmail={userEmail ?? undefined}
          userRole={userRole}
        >
          {currentUserId && tenantId && (
            <PushPermissionPrompt
              portalType="app"
              userType="admin"
              userId={currentUserId}
              tenantId={tenantId}
            />
          )}
          {children}
        </AppShell>
      </ChatSidePanelProvider>
      </PanicAlertProvider>
    </InAppNotificationProvider>
  );
}
