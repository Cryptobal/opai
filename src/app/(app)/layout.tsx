import type { Metadata } from "next";
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppLayoutClient } from '@/components/opai/AppLayoutClient';

export const metadata: Metadata = {
  title: "OPAI Suite - Gard Security",
  description: "Suite de aplicaciones inteligentes para Gard Security",
};

/**
 * Layout para rutas privadas de la aplicación (App UI)
 * 
 * Server Component que valida autenticación y delega UI a Client Component
 * 
 * Aplica a:
 * - /opai/* (dashboard, usuarios, etc)
 * - /crm
 * - /hub
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Auth check (Server Component)
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login');
  }

  const userRole = session.user?.role;
  const canManageUsers = userRole === 'owner' || userRole === 'admin';

  // Delegar UI al Client Component
  return (
    <AppLayoutClient
      userName={session.user?.name}
      userEmail={session.user?.email}
      canManageUsers={canManageUsers}
    >
      {children}
    </AppLayoutClient>
  );
}
