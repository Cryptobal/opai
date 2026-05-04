/**
 * role-nav-builder
 *
 * Construye la lista de NavItem (sidebar) a partir de:
 * - permisos del rol (real o simulado)
 * - flags `isAdmin` y `isComplianceVisible`
 * - función `isModuleEnabled(key)` (módulos habilitados del tenant)
 * - badges opcionales (notas no leídas por módulo)
 *
 * Comparten esta lógica:
 *  - `AppLayoutClient` (sidebar real)
 *  - `RolePreview`     (mock del sidebar para previsualizar permisos)
 */

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
  Brain,
  GraduationCap,
  LayoutTemplate,
} from 'lucide-react';
import type { NavItem } from '@/components/opai/AppSidebar';
import {
  type RolePermissions,
  hasModuleAccess,
  canView,
  canViewInstallations,
  hasCapability,
} from '@/lib/permissions';

export interface NavBadges {
  unreadMentionNotesCount?: number;
  notesByModule?: Record<string, number>;
}

export interface BuildNavItemsOptions {
  permissions: RolePermissions;
  isAdmin: boolean;
  isComplianceVisible: boolean;
  isModuleEnabled: (key: string) => boolean;
  badges?: NavBadges;
}

/** Sumas de badges por módulo (recalculadas a partir de notesByModule) */
function computeModuleBadges(notes: Record<string, number>) {
  return {
    crm:
      (notes.account || 0) +
      (notes.contact || 0) +
      (notes.deal || 0) +
      (notes.installation || 0) +
      (notes.lead || 0) +
      (notes.quotation || 0),
    ops:
      (notes.ticket || 0) +
      (notes.operation || 0) +
      (notes.supervision_visit || 0) +
      (notes.marcacion || 0),
    payroll: notes.payroll_record || 0,
    docs: notes.document || 0,
    finance: notes.rendicion || 0,
    personas: notes.guard || 0,
  };
}

export function buildNavItems({
  permissions,
  isAdmin,
  isComplianceVisible,
  isModuleEnabled,
  badges,
}: BuildNavItemsOptions): NavItem[] {
  const notes = badges?.notesByModule ?? {};
  const unreadMentionNotesCount = badges?.unreadMentionNotesCount ?? 0;
  const moduleBadges = computeModuleBadges(notes);

  const canAccessModule = (roleCheck: boolean, ...moduleKeys: string[]) => {
    if (!roleCheck) return false;
    if (moduleKeys.length === 0) return true;
    return moduleKeys.some((key) => isModuleEnabled(key));
  };

  return [
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
      badge: moduleBadges.crm || unreadMentionNotesCount,
      children: [
        canView(permissions, 'crm', 'leads') && { href: '/crm/leads', label: 'Leads', icon: Users, badge: notes.lead },
        canView(permissions, 'crm', 'accounts') && { href: '/crm/accounts', label: 'Cuentas', icon: Building2, badge: notes.account },
        canView(permissions, 'crm', 'deals') && { href: '/crm/deals', label: 'Negocios', icon: TrendingUp, badge: notes.deal },
        canView(permissions, 'crm', 'contacts') && { href: '/crm/contacts', label: 'Contactos', icon: Contact, badge: notes.contact },
        canView(permissions, 'crm', 'quotes') && isModuleEnabled('cpq') && { href: '/crm/cotizaciones', label: 'Cotizaciones', icon: DollarSign, badge: notes.quotation },
        canView(permissions, 'crm', 'leads') && { href: '/crm/prospecting', label: 'Prospección', icon: Sparkles },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/ops',
      label: 'Operaciones',
      icon: Activity,
      show: canAccessModule(hasModuleAccess(permissions, 'ops')),
      badge: moduleBadges.ops,
      children: [
        (canView(permissions, 'ops', 'pauta_mensual') ||
          canView(permissions, 'ops', 'pauta_diaria') ||
          canView(permissions, 'ops', 'turnos_extra') ||
          canView(permissions, 'ops', 'ppc')) && {
          href: '/ops/pautas',
          label: 'Pautas',
          icon: CalendarDays,
          badge: notes.marcacion,
        },
        canViewInstallations(permissions) && { href: '/crm/installations', label: 'Instalaciones', icon: MapPin, badge: notes.installation },
        canView(permissions, 'ops', 'supervision') && isModuleEnabled('ops_supervision') && { href: '/ops/supervision', label: 'Supervisión', icon: ClipboardCheck, badge: notes.supervision_visit },
        canView(permissions, 'ops', 'tickets') && { href: '/ops/tickets', label: 'Tickets', icon: Ticket, badge: notes.ticket },
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
      badge: moduleBadges.personas,
      children: [
        { href: '/personas/guardias', label: 'Listado', icon: User, badge: notes.guard },
        { href: '/personas/conocimiento', label: 'Conocimiento', icon: GraduationCap, badge: notes.knowledge_alert },
        isModuleEnabled('ops_onboarding') && { href: '/personas/onboarding', label: 'Onboarding', icon: UserRoundCheck },
        { href: '/personas/comunicaciones', label: 'Comunicaciones', icon: Bell },
        { href: '/personas/guardias/sueldos-rut', label: 'Sueldos por RUT', icon: DollarSign },
        canView(permissions, 'ops', 'gamificacion') && isModuleEnabled('gamificacion') && { href: '/personas/gamificacion', label: 'Gamificación', icon: Trophy },
        isModuleEnabled('psych') && { href: '/personas/psicolaboral', label: 'Psicolaboral', icon: Brain },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/payroll',
      label: 'Payroll',
      icon: Wallet,
      show: canAccessModule(hasModuleAccess(permissions, 'payroll'), 'payroll'),
      badge: moduleBadges.payroll,
      children: [
        { href: '/payroll/periodos', label: 'Períodos de Pago', icon: CalendarDays, badge: notes.payroll_record },
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
      badge: moduleBadges.finance,
      children: [
        (canView(permissions, 'finance', 'reportes') || hasCapability(permissions, 'rendicion_view_all')) && { href: '/finanzas', label: 'Inicio', icon: Grid3x3 },
        canView(permissions, 'finance', 'rendiciones') && { href: '/finanzas/rendiciones', label: 'Rendiciones', icon: Receipt, badge: notes.rendicion },
        canView(permissions, 'finance', 'facturacion') && { href: '/finanzas/facturacion', label: 'Ventas', icon: FileText },
        canView(permissions, 'finance', 'proveedores') && { href: '/finanzas/proveedores', label: 'Compras', icon: Building2 },
        canView(permissions, 'finance', 'contabilidad') && { href: '/finanzas/bancos', label: 'Banca', icon: Landmark },
        canView(permissions, 'finance', 'contabilidad') && { href: '/finanzas/contabilidad', label: 'Contabilidad', icon: BookText },
        canView(permissions, 'finance', 'reportes') && { href: '/finanzas/reportes', label: 'Informes', icon: BarChart3 },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/opai/documentos',
      label: 'Documentos',
      icon: FolderOpen,
      show: canAccessModule(hasModuleAccess(permissions, 'docs'), 'documentos'),
      badge: moduleBadges.docs,
      children: [
        canView(permissions, 'docs', 'gestion') && {
          href: '/opai/documentos',
          label: 'Gestión',
          icon: FolderOpen,
          badge: notes.document,
        },
        canView(permissions, 'docs', 'operativos') && {
          href: '/opai/documentos-operativos',
          label: 'Operativos',
          icon: ClipboardCheck,
        },
        canView(permissions, 'docs', 'plantillas') && {
          href: '/opai/documentos/templates',
          label: 'Templates',
          icon: LayoutTemplate,
        },
      ].filter(Boolean) as NavItem['children'],
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
    {
      href: '/portales',
      label: 'Portales',
      icon: Monitor,
      show: isAdmin,
      children: [
        isModuleEnabled('portal_guardia') && { href: '/portal/guardia', label: 'Portal Guardia', icon: Shield },
        isModuleEnabled('ops_rondas') && { href: '/portal/rondas', label: 'Portal Rondas', icon: Route },
        isModuleEnabled('portal_cliente') && { href: '/portal/cliente', label: 'Portal Cliente', icon: Users },
        isModuleEnabled('portal_marcacion') && { href: '/portal/marcacion', label: 'Portal Marcación', icon: Fingerprint },
        isModuleEnabled('control_acceso') && { href: '/portal/acceso', label: 'Control de Acceso', icon: ScanLine },
      ].filter(Boolean) as NavItem['children'],
    },
    {
      href: '/opai/compliance/arco',
      label: 'Cumplimiento',
      icon: Shield,
      show: isComplianceVisible,
      children: [
        { href: '/opai/compliance/arco', label: 'Solicitudes ARCO', icon: Shield },
      ],
    },
  ];
}
