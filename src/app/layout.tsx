import type { Metadata } from "next";
import Script from "next/script";
import "../styles/globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/opai/ThemeProvider";

export const metadata: Metadata = {
  title: "Gard Docs - Presentaciones Comerciales",
  description: "Sistema de presentaciones comerciales inteligente para Gard Security",
  icons: {
    icon: [
      { url: "/iconos_azul/icon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/iconos_azul/icon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/iconos_azul/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/iconos_azul/icon-192x192.png", sizes: "180x180", type: "image/png" },
      { url: "/iconos_azul/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/iconos_azul/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "OPAI",
    statusBarStyle: "default",
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
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
