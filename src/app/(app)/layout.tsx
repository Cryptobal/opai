import type { Metadata } from "next";
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppLayoutClient } from '@/components/opai/AppLayoutClient';
import { PermissionsProvider } from '@/lib/permissions-context';
import { ImpersonateBanner } from '@/components/platform/ImpersonateBanner';
import { TenantModulesProvider } from '@/contexts/TenantModulesContext';
import { DpaConsentBanner } from '@/components/DpaConsentBanner';
import { parseSurface, SURFACE_COOKIE } from '@/lib/surface';
import { brandCssVars } from '@/lib/branding/brand-css-vars';
import { getAppRequestContext } from '@/lib/app-request-context';

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
  const ctx = await getAppRequestContext();
  if (!ctx?.session?.user) {
    redirect('/opai/login');
  }

  const { session, permissions, tenantModules, tenantFlags, companyConfig, photoUrl } = ctx;
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
            userPhotoUrl={photoUrl}
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
