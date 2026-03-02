'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Building2,
  Grid3x3,
  Calculator,
  ClipboardList,
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
  Shield,
  ClipboardCheck,
  Landmark,
  Package,
  BookText,
  Inbox,
  Sparkles,
} from 'lucide-react';
import { AppShell, AppSidebar, type NavItem } from '@/components/opai';
import { type RolePermissions, hasModuleAccess, canView, hasCapability } from '@/lib/permissions';

interface AppLayoutClientProps {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole: string;
  permissions: RolePermissions;
}

export function AppLayoutClient({
  children,
  userName,
  userEmail,
  userRole,
  permissions,
}: AppLayoutClientProps) {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [unreadMentionNotesCount, setUnreadMentionNotesCount] = useState(0);
  const [notesByModule, setNotesByModule] = useState<Record<string, number>>({});
  const [activityUnreadTotal, setActivityUnreadTotal] = useState(0);

  const fetchUnreadCounters = useCallback(() => {
    Promise.all([
      fetch('/api/notifications?limit=1').then((r) => r.json()),
      fetch('/api/notifications?limit=1&types=mention,mention_direct,mention_group').then((r) => r.json()),
      fetch('/api/notes/unread-counts', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([allData, noteData, unreadCounts]) => {
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
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnreadCounters();
    const interval = setInterval(() => {
      fetchUnreadCounters();
    }, 30000);
    const onNoteSeen = () => fetchUnreadCounters();
    window.addEventListener('opai-note-seen', onNoteSeen as EventListener);
    return () => {
      clearInterval(interval);
      window.removeEventListener('opai-note-seen', onNoteSeen as EventListener);
    };
  }, [fetchUnreadCounters]);

  // Compute per-module unread note totals for parent sidebar badges
  const crmNotesBadge = (notesByModule.account || 0) + (notesByModule.contact || 0) + (notesByModule.deal || 0) + (notesByModule.installation || 0) + (notesByModule.lead || 0) + (notesByModule.quotation || 0);
  const opsNotesBadge = (notesByModule.ticket || 0) + (notesByModule.operation || 0) + (notesByModule.supervision_visit || 0);
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
      href: '/opai/actividad',
      label: 'Actividad',
      icon: Inbox,
      show: true,
      badge: activityUnreadTotal,
    },
    {
      href: '/opai/notificaciones',
      label: 'Notificaciones',
      icon: Bell,
      show: true,
      badge: notificationUnreadCount,
    },
    {
      href: '/opai/inicio',
      label: 'Documentos',
      icon: FileText,
      show: hasModuleAccess(permissions, 'docs'),
      badge: docsNotesBadge,
      children: [
        { href: '/opai/inicio', label: 'Envíos', icon: FileText },
        { href: '/opai/documentos', label: 'Gestión', icon: FolderOpen, badge: notesByModule.document },
      ],
    },
    {
      href: '/crm',
      label: 'Comercial',
      icon: Building2,
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
      href: '/payroll',
      label: 'Payroll',
      icon: Calculator,
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
      href: '/ops',
      label: 'Operaciones',
      icon: ClipboardList,
      show: hasModuleAccess(permissions, 'ops'),
      badge: opsNotesBadge,
      children: [
        // ── Subgrupo Pautas ──
        (canView(permissions, 'ops', 'pauta_mensual') || canView(permissions, 'ops', 'pauta_diaria') || canView(permissions, 'ops', 'turnos_extra') || canView(permissions, 'ops', 'ppc')) && {
          href: '/ops/pautas',
          label: 'Pautas',
          icon: CalendarDays,
          children: [
            canView(permissions, 'ops', 'pauta_mensual') && { href: '/ops/pauta-mensual', label: 'Mensual', icon: CalendarDays },
            canView(permissions, 'ops', 'pauta_diaria') && { href: '/ops/pauta-diaria', label: 'Diaria', icon: UserRoundCheck },
            canView(permissions, 'ops', 'turnos_extra') && { href: '/ops/turnos-extra', label: 'Turnos Extra', icon: Receipt },
            canView(permissions, 'ops', 'turnos_extra') && { href: '/ops/refuerzos', label: 'Refuerzos', icon: Clock3 },
            canView(permissions, 'ops', 'ppc') && { href: '/ops/ppc', label: 'PPC', icon: ShieldAlert },
          ].filter(Boolean) as NavItem['children'],
        },
        // ── Ítems individuales ──
        canView(permissions, 'ops', 'marcaciones') && { href: '/ops/marcaciones', label: 'Marcaciones', icon: Fingerprint },
        canView(permissions, 'ops', 'rondas') && { href: '/ops/rondas', label: 'Rondas', icon: Route },
        canView(permissions, 'ops', 'control_nocturno') && { href: '/ops/control-nocturno', label: 'Control Nocturno', icon: Moon, badge: notesByModule.operation },
        canView(permissions, 'ops', 'tickets') && { href: '/ops/tickets', label: 'Tickets', icon: Ticket, badge: notesByModule.ticket },
        canView(permissions, 'ops', 'inventario') && { href: '/ops/inventario', label: 'Inventario', icon: Package },
        canView(permissions, 'ops', 'supervision') && { href: '/ops/supervision', label: 'Supervisión', icon: ClipboardCheck, badge: notesByModule.supervision_visit },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/personas/guardias',
      label: 'Personas',
      icon: Shield,
      show: hasModuleAccess(permissions, 'ops'),
      badge: personasNotesBadge,
      children: [
        { href: '/personas/guardias', label: 'Listado', icon: Shield, badge: notesByModule.guard },
        { href: '/personas/guardias/sueldos-rut', label: 'Sueldos por RUT', icon: DollarSign },
      ],
    },
    {
      href: '/finanzas',
      label: 'Finanzas',
      icon: Receipt,
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
  ], [permissions, isAdmin, notificationUnreadCount, unreadMentionNotesCount, notesByModule, crmNotesBadge, opsNotesBadge, payrollNotesBadge, docsNotesBadge, financeNotesBadge, personasNotesBadge, activityUnreadTotal]);

  return (
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
      {children}
    </AppShell>
  );
}
