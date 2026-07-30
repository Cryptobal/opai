import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/portal/rondas/ServiceWorkerRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";
import { PlatformDataAttribute } from "@/components/opai/portal-shell";
import { GlassAmbient } from "@/components/opai-ds/GlassAmbient";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0f1a",
};

export const metadata: Metadata = {
  title: "OPAI — Portal Guardia",
  description: "Portal de guardias de seguridad.",
  manifest: "/manifest-guardia.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Guardias",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalGuardiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh" style={{ paddingTop: 'var(--safe-area-top)' }}>
      <GlassAmbient />
      <ServiceWorkerRegistrar scope="/portal/guardia" />
      <PlatformDataAttribute />
      <BadgeClear />
      {children}
    </div>
  );
}
