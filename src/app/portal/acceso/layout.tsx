import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/portal/rondas/ServiceWorkerRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060a13",
};

export const metadata: Metadata = {
  title: "OPAI — Control de Acceso",
  description: "Control de acceso e ingreso.",
  manifest: "/manifest-acceso.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Acceso",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalAccesoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh text-foreground antialiased" style={{ paddingTop: 'var(--safe-area-top)' }}>
      <ServiceWorkerRegistrar scope="/portal/acceso" />
      <BadgeClear />
      {children}
    </div>
  );
}
