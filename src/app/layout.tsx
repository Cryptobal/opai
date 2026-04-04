import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "../styles/globals.css";

/** Google Tag Manager (opai.cl) — override con NEXT_PUBLIC_GTM_ID en .env si hace falta */
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-WNF9VD9B";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/opai/ThemeProvider";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { BadgeClear } from "@/components/pwa/BadgeClear";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060a13",
};

export const metadata: Metadata = {
  title: "OPAI - Presentaciones Comerciales",
  description: "Suite de aplicaciones inteligentes",
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
    ],
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
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            var t = localStorage.getItem('opai-theme');
            if (t === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
          } catch(e) { document.documentElement.classList.add('dark'); }
        `}</Script>
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      </head>
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <ThemeProvider>
          <PWAProvider>
            <BadgeClear />
            {children}
          </PWAProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
