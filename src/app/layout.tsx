import type { Metadata } from "next";
import "../styles/globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Gard Docs - Presentaciones Comerciales",
  description: "Sistema de presentaciones comerciales inteligente para Gard Security",
  icons: {
    icon: [
      { url: "/icons/icon-48x48.png?v=gard", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-96x96.png?v=gard", sizes: "96x96", type: "image/png" },
      { url: "/icons/icon-192x192.png?v=gard", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-180x180.png?v=gard", sizes: "180x180", type: "image/png" },
      { url: "/icons/icon-192x192.png?v=gard", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png?v=gard", sizes: "512x512", type: "image/png" },
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
