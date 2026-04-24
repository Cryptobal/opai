import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Exo_2, DM_Sans, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { BadgeClear } from "@/components/pwa/BadgeClear";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { ThemeProvider } from "@/components/opai/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { CookieConsentBanner } from "@/components/CookieConsent";
import { ConditionalAnalytics } from "@/components/ConditionalAnalytics";
import { PlatformDataAttribute } from "@/components/opai/portal-shell";
import "../styles/globals.css";

const exo2 = Exo_2({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800", "900"],
  variable: "--font-exo2",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

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
    <html lang="es" className={`dark ${exo2.variable} ${dmSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
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
        </ThemeProvider>
        <CookieConsentBanner />
        <Analytics />
      </body>
    </html>
  );
}
