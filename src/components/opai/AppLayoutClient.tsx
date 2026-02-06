'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { 
  FileText, 
  Users, 
  LogOut,
  Building2,
  Grid3x3,
} from 'lucide-react';
import { AppShell, AppSidebar, type NavItem } from '@/components/opai';

interface AppLayoutClientProps {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  canManageUsers: boolean;
}

export function AppLayoutClient({ 
  children, 
  userName, 
  userEmail,
  canManageUsers 
}: AppLayoutClientProps) {
  // Nav items con iconos (ahora en Client Component)
  const navItems: NavItem[] = [
    { 
      href: '/opai/inicio', 
      label: 'Documentos', 
      icon: FileText,
      show: true 
    },
    { 
      href: '/opai/usuarios', 
      label: 'Usuarios', 
      icon: Users,
      show: canManageUsers 
    },
    { 
      href: '/crm', 
      label: 'CRM', 
      icon: Building2,
      show: true 
    },
    { 
      href: '/hub', 
      label: 'Hub', 
      icon: Grid3x3,
      show: true 
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
