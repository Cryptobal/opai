import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { BadgeClear } from "@/components/pwa/BadgeClear";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { ThemeProvider } from "@/components/opai/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { UndoSnackbarHost } from "@/components/opai-ds";
import { ConfirmHost } from "@/components/ui/confirm-service";
import { CookieConsentBanner } from "@/components/CookieConsent";
import { ConditionalAnalytics } from "@/components/ConditionalAnalytics";
import { PlatformDataAttribute } from "@/components/opai/portal-shell";
import "../styles/globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060a13",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.opai.cl'),
  manifest: '/manifest.json',
  title: {
    default: 'OPAI — ERP para Empresas de Seguridad Privada | Chile',
    template: '%s | OPAI',
  },
  description:
    'El único ERP diseñado exclusivamente para empresas de seguridad privada ' +
    'en Chile. Operaciones, CRM, Finanzas y Nómina con IA operacional real. ' +
    'Face ID, GPS en tiempo real, alertas WhatsApp automáticas.',
  keywords: [
    'ERP seguridad privada Chile',
    'software gestión guardias seguridad',
    'control rondas GPS tiempo real',
    'marcaciones biométricas guardias',
    'nómina guardias Chile',
    'sistema OS10 seguridad privada',
  ],
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
  alternates: {
    canonical: 'https://www.opai.cl',
  },
  openGraph: {
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630 }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <style dangerouslySetInnerHTML={{ __html: "html{background:#060a13}" }} />
        <link
          rel="apple-touch-startup-image"
          href="/icons/splash/apple-splash-1170-2532.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/splash/apple-splash-1284-2778.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/splash/apple-splash-1290-2796.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/splash/apple-splash-750-1334.png"
          media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"
        />
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            var t = localStorage.getItem('opai-theme');
            if (t === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
          } catch(e) { document.documentElement.classList.add('dark'); }
        `}</Script>
      </head>
      <body>
        <PlatformDataAttribute />
        <ConditionalAnalytics />
        <ThemeProvider>
          <PWAProvider>
            <BadgeClear />
            {children}
          </PWAProvider>
          <Toaster />
          <UndoSnackbarHost />
          <ConfirmHost />
        </ThemeProvider>
        <CookieConsentBanner />
        <Analytics />
      </body>
    </html>
  );
}
