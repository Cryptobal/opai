import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/portal/rondas/ServiceWorkerRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#060a13",
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
    <>
      <ServiceWorkerRegistrar />
      <BadgeClear />
      {children}
    </>
  );
}
