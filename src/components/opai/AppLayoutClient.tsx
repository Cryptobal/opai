'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { 
  FileText, 
  Users, 
  LogOut,
  Building2,
  Grid3x3,
  LayoutTemplate,
  DollarSign,
} from 'lucide-react';
import { AppShell, AppSidebar, type NavItem } from '@/components/opai';
import { hasAppAccess } from '@/lib/app-access';

interface AppLayoutClientProps {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userRole: string;
  canManageUsers: boolean;
}

export function AppLayoutClient({ 
  children, 
  userName, 
  userEmail,
  userRole,
  canManageUsers 
}: AppLayoutClientProps) {
  // Nav items con App Access control
  const navItems: NavItem[] = [
    { 
      href: '/hub', 
      label: 'Inicio', 
      icon: Grid3x3,
      show: hasAppAccess(userRole, 'hub')
    },
    { 
      href: '/opai/inicio', 
      label: 'Documentos', 
      icon: FileText,
      show: hasAppAccess(userRole, 'docs')
    },
    { 
      href: '/opai/templates', 
      label: 'Templates', 
      icon: LayoutTemplate,
      show: hasAppAccess(userRole, 'docs') // Templates son parte de Docs
    },
    { 
      href: '/opai/usuarios', 
      label: 'Usuarios', 
      icon: Users,
      show: hasAppAccess(userRole, 'admin')
    },
    { 
      href: '/crm', 
      label: 'CRM', 
      icon: Building2,
      show: hasAppAccess(userRole, 'crm')
    },
    { 
      href: '/cpq', 
      label: 'CPQ', 
      icon: DollarSign,
      show: hasAppAccess(userRole, 'cpq')
    },
  ];

  // User menu - ahora en sidebar footer
  const userMenu = (
    <Link
      href="/api/auth/signout?callbackUrl=/opai/login"
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      title="Cerrar sesión"
    >
      <LogOut className="h-4 w-4" />
      <span>Salir</span>
    </Link>
  );

  return (
    <AppShell
      sidebar={
        <AppSidebar 
          navItems={navItems}
          footer={userMenu}
        />
      }
    >
      {children}
    </AppShell>
  );
}
