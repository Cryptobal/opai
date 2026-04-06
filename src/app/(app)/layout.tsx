import type { Metadata } from "next";
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppLayoutClient } from '@/components/opai/AppLayoutClient';
import { resolvePermissions } from '@/lib/permissions-server';
import { PermissionsProvider } from '@/lib/permissions-context';
import { ImpersonateBanner } from '@/components/platform/ImpersonateBanner';
import { getTenantModulesList } from '@/lib/tenant-modules';
import { TenantModulesProvider } from '@/contexts/TenantModulesContext';

/** Evita pre-render en build; todas las rutas requieren auth/DB */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "OPAI Suite",
  description: "Suite de aplicaciones inteligentes",
};

/**
 * Layout para rutas privadas de la aplicación (App UI)
 * 
 * Server Component que valida autenticación, resuelve permisos
 * y provee el contexto de permisos a toda la app.
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

  // Resolver permisos, refrescar nombre/email desde BD, y cargar módulos del tenant.
  const [permissions, dbUser, tenantModules] = await Promise.all([
    resolvePermissions({
      role: session.user.role,
      roleTemplateId: session.user.roleTemplateId,
    }),
    prisma.admin.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
    session.user.tenantId
      ? getTenantModulesList(session.user.tenantId)
      : Promise.resolve([] as string[]),
  ]);

  const isImpersonating = (session as any).impersonating === true;

  // Delegar UI al Client Component con permisos resueltos
  return (
    <>
      {isImpersonating && <ImpersonateBanner />}
      <PermissionsProvider permissions={permissions}>
        <TenantModulesProvider initialModules={tenantModules}>
          <AppLayoutClient
            userName={dbUser?.name ?? session.user?.name}
            userEmail={dbUser?.email ?? session.user?.email}
            userRole={session.user.role}
            permissions={permissions}
            currentUserId={session.user.id}
            tenantId={session.user.tenantId}
          >
            {children}
          </AppLayoutClient>
        </TenantModulesProvider>
      </PermissionsProvider>
    </>
  );
}
