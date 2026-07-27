import type { Metadata } from "next";
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppLayoutClient } from '@/components/opai/AppLayoutClient';
import { resolvePermissions } from '@/lib/permissions-server';
import { PermissionsProvider } from '@/lib/permissions-context';
import { ImpersonateBanner } from '@/components/platform/ImpersonateBanner';
import { getTenantModulesList, getTenantFeatureFlagsList } from '@/lib/tenant-modules';
import { TenantModulesProvider } from '@/contexts/TenantModulesContext';
import { DpaConsentBanner } from '@/components/DpaConsentBanner';
import { parseSurface, SURFACE_COOKIE } from '@/lib/surface';
import { getTenantCompanyConfig } from '@/lib/tenant-config';
import { brandCssVars } from '@/lib/branding/brand-css-vars';

/** Evita pre-render en build; todas las rutas requieren auth/DB */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "OPAI Suite",
  description: "Suite de aplicaciones inteligentes",
  robots: { index: false, follow: false },
};

/**
 * Layout para rutas privadas de la aplicación (App UI).
 * name/email salen del JWT (H2); se refrescan en cliente si hace falta.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login');
  }

  const [permissions, tenantModules, tenantFlags, companyConfig] = await Promise.all([
    resolvePermissions({
      role: session.user.role,
      roleTemplateId: session.user.roleTemplateId,
    }),
    session.user.tenantId
      ? getTenantModulesList(session.user.tenantId)
      : Promise.resolve([] as string[]),
    session.user.tenantId
      ? getTenantFeatureFlagsList(session.user.tenantId)
      : Promise.resolve([] as string[]),
    session.user.tenantId
      ? getTenantCompanyConfig(session.user.tenantId)
      : Promise.resolve(null),
  ]);

  const isImpersonating = (session as { impersonating?: boolean }).impersonating === true;

  const cookieStore = await cookies();
  const surface = parseSurface(cookieStore.get(SURFACE_COOKIE)?.value);

  const brandCss = companyConfig
    ? brandCssVars({
        primaryColor: companyConfig.brandingPrimaryColor,
        secondaryColor: companyConfig.brandingSecondaryColor,
        accentColor: companyConfig.brandingAccentColor,
      })
    : "";

  return (
    <>
      {brandCss ? (
        <style
          id="opai-brand"
          dangerouslySetInnerHTML={{ __html: brandCss }}
        />
      ) : null}
      {isImpersonating && <ImpersonateBanner />}
      <PermissionsProvider permissions={permissions}>
        <TenantModulesProvider initialModules={tenantModules} initialFlags={tenantFlags}>
          <AppLayoutClient
            userName={session.user?.name}
            userEmail={session.user?.email}
            userRole={session.user.role}
            permissions={permissions}
            currentUserId={session.user.id}
            tenantId={session.user.tenantId}
            surface={surface}
          >
            {children}
            <DpaConsentBanner userRole={session.user.role ?? ""} />
          </AppLayoutClient>
        </TenantModulesProvider>
      </PermissionsProvider>
    </>
  );
}
