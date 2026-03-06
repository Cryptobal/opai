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
  Clock3,
  UserRoundCheck,
  ShieldAlert,
  Fingerprint,
  Route,
  Moon,
  Ticket,
  FolderOpen,
  Wallet,
  BarChart3,
  Bell,
  User,
  ClipboardCheck,
  Landmark,
  Package,
  BookText,
  Inbox,
  ClipboardList,
  Monitor,
  MessageCircle,
  Shield,
} from 'lucide-react';
import { AppShell, AppSidebar, type NavItem } from '@/components/opai';
import { type RolePermissions, hasModuleAccess, canView, hasCapability } from '@/lib/permissions';
import { RoleSimulationProvider, useRoleSimulation } from '@/contexts/RoleSimulationContext';
import { ChatFloatingProvider } from '@/components/chat/ChatFloatingProvider';
import { PushPermissionPrompt } from '@/components/pwa/PushPermissionPrompt';

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
      <AppLayoutClientInner {...props} />
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
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [unreadMentionNotesCount, setUnreadMentionNotesCount] = useState(0);
  const [notesByModule, setNotesByModule] = useState<Record<string, number>>({});
  const [activityUnreadTotal, setActivityUnreadTotal] = useState(0);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);

  const fetchUnreadCounters = useCallback(() => {
    Promise.all([
      fetch('/api/notifications?limit=1').then((r) => r.json()),
      fetch('/api/notifications?limit=1&types=mention,mention_direct,mention_group').then((r) => r.json()),
      fetch('/api/notes/unread-counts', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/chat/unread-counts', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ])
      .then(([allData, noteData, unreadCounts, chatCounts]) => {
        if (allData?.success && typeof allData?.meta?.unreadCount === 'number') {
          setNotificationUnreadCount(allData.meta.unreadCount);
        }
        if (noteData?.success && typeof noteData?.meta?.unreadCount === 'number') {
          setUnreadMentionNotesCount(noteData.meta.unreadCount);
        }
        if (unreadCounts?.success && unreadCounts?.data?.byModule) {
          setNotesByModule(unreadCounts.data.byModule);
          setActivityUnreadTotal(typeof unreadCounts.data.total === 'number' ? unreadCounts.data.total : 0);
        }
        if (chatCounts?.success && typeof chatCounts?.data?.total === 'number') {
          setChatUnreadTotal(chatCounts.data.total);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchUnreadCounters();
    const interval = setInterval(() => {
      fetchUnreadCounters();
    }, 30000);
    const onRefresh = () => fetchUnreadCounters();
    window.addEventListener('opai-note-seen', onRefresh as EventListener);
    window.addEventListener('opai-notification-read', onRefresh as EventListener);
    return () => {
      clearInterval(interval);
      window.removeEventListener('opai-note-seen', onRefresh as EventListener);
      window.removeEventListener('opai-notification-read', onRefresh as EventListener);
    };
  }, [fetchUnreadCounters]);

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
      show: hasModuleAccess(permissions, 'hub'),
    },
    {
      href: '/chat',
      label: 'Chat',
      icon: MessageCircle,
      show: true,
      badge: chatUnreadTotal,
    },
    {
      href: '/opai/notificaciones',
      label: 'Notificaciones',
      icon: Bell,
      show: true,
      badge: notificationUnreadCount,
    },
    {
      href: '/crm',
      label: 'Comercial',
      icon: TrendingUp,
      show: hasModuleAccess(permissions, 'crm'),
      badge: crmNotesBadge || unreadMentionNotesCount,
      children: [
        canView(permissions, 'crm', 'leads') && { href: '/crm/leads', label: 'Leads', icon: Users, badge: notesByModule.lead },
        canView(permissions, 'crm', 'accounts') && { href: '/crm/accounts', label: 'Cuentas', icon: Building2, badge: notesByModule.account },
        canView(permissions, 'crm', 'installations') && { href: '/crm/installations', label: 'Instalaciones', icon: MapPin, badge: notesByModule.installation },
        canView(permissions, 'crm', 'deals') && { href: '/crm/deals', label: 'Negocios', icon: TrendingUp, badge: notesByModule.deal },
        canView(permissions, 'crm', 'contacts') && { href: '/crm/contacts', label: 'Contactos', icon: Contact, badge: notesByModule.contact },
        canView(permissions, 'crm', 'quotes') && { href: '/crm/cotizaciones', label: 'Cotizaciones', icon: DollarSign, badge: notesByModule.quotation },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/ops',
      label: 'Operaciones',
      icon: Activity,
      show: hasModuleAccess(permissions, 'ops'),
      badge: opsNotesBadge,
      children: [
        // ── Subgrupo Pautas (Etapa 3) ──
        (canView(permissions, 'ops', 'pauta_mensual') || canView(permissions, 'ops', 'pauta_diaria') || canView(permissions, 'ops', 'turnos_extra') || canView(permissions, 'ops', 'ppc')) && {
          href: '/ops/pautas',
          label: 'Pautas',
          icon: CalendarDays,
          badge: notesByModule.marcacion,
        },
        // ── Ítems individuales ──
        canView(permissions, 'ops', 'supervision') && { href: '/ops/supervision', label: 'Supervisión', icon: ClipboardCheck, badge: notesByModule.supervision_visit },
        canView(permissions, 'ops', 'tickets') && { href: '/ops/tickets', label: 'Tickets', icon: Ticket, badge: notesByModule.ticket },
        canView(permissions, 'ops', 'rondas') && { href: '/ops/rondas', label: 'Rondas', icon: Route },
        canView(permissions, 'ops', 'control_nocturno') && { href: '/ops/control-nocturno', label: 'Control Nocturno', icon: Moon, badge: notesByModule.operation },
        canView(permissions, 'ops', 'inventario') && { href: '/ops/inventario', label: 'Inventario', icon: Package },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/personas/guardias',
      label: 'Personas',
      icon: User,
      show: hasModuleAccess(permissions, 'ops'),
      badge: personasNotesBadge,
      children: [
        { href: '/personas/guardias', label: 'Listado', icon: User, badge: notesByModule.guard },
        { href: '/personas/guardias/sueldos-rut', label: 'Sueldos por RUT', icon: DollarSign },
      ],
    },
    {
      href: '/payroll',
      label: 'Payroll',
      icon: Wallet,
      show: hasModuleAccess(permissions, 'payroll'),
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
      show: hasModuleAccess(permissions, 'finance'),
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
      show: hasModuleAccess(permissions, 'docs'),
      badge: docsNotesBadge,
      children: [
        { href: '/opai/inicio', label: 'Envíos', icon: FileText },
        { href: '/opai/documentos', label: 'Gestión', icon: FolderOpen, badge: notesByModule.document },
      ],
    },
    // ── Portales (solo owner/admin) ──
    {
      href: '/portales',
      label: 'Portales',
      icon: Monitor,
      show: isAdmin,
      children: [
        { href: '/portal/guardia', label: 'Portal Guardia', icon: Shield },
        { href: '/portal/rondas', label: 'Portal Rondas', icon: Route },
        { href: '/portal/cliente', label: 'Portal Cliente', icon: Users },
        { href: '/portal/supervisor', label: 'Portal Supervisor', icon: ClipboardCheck },
        { href: '/portal/acceso', label: 'Control de Acceso', icon: Fingerprint },
      ],
    },
  ], [permissions, isAdmin, notificationUnreadCount, unreadMentionNotesCount, notesByModule, crmNotesBadge, opsNotesBadge, payrollNotesBadge, docsNotesBadge, financeNotesBadge, personasNotesBadge, chatUnreadTotal]);

  return (
    <ChatFloatingProvider currentUserId={currentUserId ?? ''} userRole={userRole}>
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
        notificationUnreadCount={notificationUnreadCount}
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
    </ChatFloatingProvider>
  );
}
