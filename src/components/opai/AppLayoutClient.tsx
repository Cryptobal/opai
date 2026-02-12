'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import {
  FileText,
  Building2,
  Grid3x3,
  Calculator,
  ClipboardList,
  Settings,
} from 'lucide-react';
import { AppShell, AppSidebar, type NavItem } from '@/components/opai';
import { hasAppAccess } from '@/lib/app-access';
import { hasAnyConfigSubmoduleAccess } from '@/lib/module-access';

interface AppLayoutClientProps {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole: string;
}

export function AppLayoutClient({
  children,
  userName,
  userEmail,
  userRole,
}: AppLayoutClientProps) {
  const navItems: NavItem[] = [
    {
      href: '/hub',
      label: 'Inicio',
      icon: Grid3x3,
      show: hasAppAccess(userRole, 'hub'),
    },
    {
      href: '/opai/inicio',
      label: 'Documentos',
      icon: FileText,
      show: hasAppAccess(userRole, 'docs'),
    },
    {
      href: '/crm',
      label: 'CRM',
      icon: Building2,
      show: hasAppAccess(userRole, 'crm'),
    },
    {
      href: '/payroll',
      label: 'Payroll',
      icon: Calculator,
      show: hasAppAccess(userRole, 'payroll'),
    },
    {
      href: '/ops',
      label: 'Ops',
      icon: ClipboardList,
      show: hasAppAccess(userRole, 'ops'),
    },
    {
      href: '/opai/configuracion',
      label: 'Configuración',
      icon: Settings,
      show: hasAnyConfigSubmoduleAccess(userRole),
    },
  ];

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
