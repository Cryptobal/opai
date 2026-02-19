import type { Metadata } from "next";
import "../styles/globals.css";
import { Toaster } from "@/components/ui/toaster";

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
    <html lang="es">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
