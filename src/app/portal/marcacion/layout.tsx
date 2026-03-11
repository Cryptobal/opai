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
  title: "OPAI — Marcación",
  description: "Marcación de asistencia con Face ID.",
  manifest: "/manifest-marcacion.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Marcación",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalMarcacionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh text-[#F9FAFB] antialiased">
      <ServiceWorkerRegistrar />
      <BadgeClear />
      {children}
    </div>
  );
}
