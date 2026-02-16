'use client';

import { ReactNode, useMemo } from 'react';
import {
  FileText,
  Building2,
  Grid3x3,
  Calculator,
  ClipboardList,
  Settings,
  Receipt,
  Users,
  MapPin,
  TrendingUp,
  Contact,
  DollarSign,
  CalendarDays,
  UserRoundCheck,
  ShieldAlert,
  Fingerprint,
  Route,
  Moon,
  Ticket,
  FolderOpen,
  Plug,
  Bell,
  Wallet,
  BarChart3,
  CheckCircle2,
  Shield,
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
  const navItems: NavItem[] = useMemo(() => [
    {
      href: '/hub',
      label: 'Inicio',
      icon: Grid3x3,
      show: hasModuleAccess(permissions, 'hub'),
    },
    {
      href: '/opai/inicio',
      label: 'Documentos',
      icon: FileText,
      show: hasModuleAccess(permissions, 'docs'),
      children: [
        { href: '/opai/inicio', label: 'Envíos', icon: FileText },
        { href: '/opai/documentos', label: 'Gestión', icon: FolderOpen },
      ],
    },
    {
      href: '/crm',
      label: 'CRM',
      icon: Building2,
      show: hasModuleAccess(permissions, 'crm'),
      children: [
        canView(permissions, 'crm', 'leads') && { href: '/crm/leads', label: 'Leads', icon: Users },
        canView(permissions, 'crm', 'accounts') && { href: '/crm/accounts', label: 'Cuentas', icon: Building2 },
        canView(permissions, 'crm', 'installations') && { href: '/crm/installations', label: 'Instalaciones', icon: MapPin },
        canView(permissions, 'crm', 'deals') && { href: '/crm/deals', label: 'Negocios', icon: TrendingUp },
        canView(permissions, 'crm', 'contacts') && { href: '/crm/contacts', label: 'Contactos', icon: Contact },
        canView(permissions, 'crm', 'quotes') && { href: '/crm/cotizaciones', label: 'Cotizaciones', icon: DollarSign },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/payroll',
      label: 'Payroll',
      icon: Calculator,
      show: hasModuleAccess(permissions, 'payroll'),
      children: [
        { href: '/payroll/simulator', label: 'Simulador', icon: Calculator },
        { href: '/payroll/parameters', label: 'Parámetros', icon: FileText },
      ],
    },
    {
      href: '/ops',
      label: 'Operaciones',
      icon: ClipboardList,
      show: hasModuleAccess(permissions, 'ops'),
      children: [
        canView(permissions, 'ops', 'pauta_mensual') && { href: '/ops/pauta-mensual', label: 'Pauta Mensual', icon: CalendarDays },
        canView(permissions, 'ops', 'pauta_diaria') && { href: '/ops/pauta-diaria', label: 'Pauta Diaria', icon: UserRoundCheck },
        canView(permissions, 'ops', 'marcaciones') && { href: '/ops/marcaciones', label: 'Marcaciones', icon: Fingerprint },
        canView(permissions, 'ops', 'ppc') && { href: '/ops/ppc', label: 'PPC', icon: ShieldAlert },
        canView(permissions, 'ops', 'rondas') && { href: '/ops/rondas', label: 'Rondas', icon: Route },
        canView(permissions, 'ops', 'control_nocturno') && { href: '/ops/control-nocturno', label: 'Control Nocturno', icon: Moon },
        canView(permissions, 'ops', 'tickets') && { href: '/ops/tickets', label: 'Tickets', icon: Ticket },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/personas/guardias',
      label: 'Guardias',
      icon: Shield,
      show: hasModuleAccess(permissions, 'ops'),
    },
    {
      href: '/finanzas',
      label: 'Finanzas',
      icon: Receipt,
      show: hasModuleAccess(permissions, 'finance'),
      children: [
        { href: '/finanzas', label: 'Inicio', icon: Grid3x3 },
        canView(permissions, 'finance', 'rendiciones') && { href: '/finanzas/rendiciones', label: 'Rendiciones', icon: Receipt },
        canView(permissions, 'finance', 'aprobaciones') && hasCapability(permissions, 'rendicion_approve') && { href: '/finanzas/aprobaciones', label: 'Aprobaciones', icon: CheckCircle2 },
        canView(permissions, 'finance', 'pagos') && hasCapability(permissions, 'rendicion_pay') && { href: '/finanzas/pagos', label: 'Pagos', icon: Wallet },
        canView(permissions, 'finance', 'reportes') && { href: '/finanzas/reportes', label: 'Reportes', icon: BarChart3 },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/opai/configuracion',
      label: 'Configuración',
      icon: Settings,
      show: hasModuleAccess(permissions, 'config'),
      children: [
        canView(permissions, 'config', 'usuarios') && { href: '/opai/configuracion/usuarios', label: 'Usuarios', icon: Users },
        canView(permissions, 'config', 'grupos') && { href: '/opai/configuracion/grupos', label: 'Grupos', icon: Users },
        canView(permissions, 'config', 'integraciones') && { href: '/opai/configuracion/integraciones', label: 'Integraciones', icon: Plug },
        canView(permissions, 'config', 'notificaciones') && { href: '/opai/configuracion/notificaciones', label: 'Alertas', icon: Bell },
        canView(permissions, 'config', 'crm') && { href: '/opai/configuracion/crm', label: 'CRM', icon: TrendingUp },
        canView(permissions, 'config', 'cpq') && { href: '/opai/configuracion/cpq', label: 'CPQ', icon: DollarSign },
        canView(permissions, 'config', 'ops') && { href: '/opai/configuracion/ops', label: 'Ops', icon: ClipboardList },
        canView(permissions, 'config', 'tipos_ticket') && { href: '/opai/configuracion/tipos-ticket', label: 'Tickets', icon: Ticket },
      ].filter(Boolean) as NavItem['children'],
    },
  ], [permissions]);

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
    >
      {children}
    </AppShell>
  );
}
