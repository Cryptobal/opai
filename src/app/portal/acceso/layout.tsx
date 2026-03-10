import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/portal/rondas/ServiceWorkerRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A0F1C",
};

export const metadata: Metadata = {
  title: "Control de Acceso — Gard Security",
  description: "Control de acceso e ingreso — Gard Security",
  manifest: "/manifest-acceso.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Control Acceso",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalAccesoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0A0F1C] text-[#F9FAFB] antialiased">
      <ServiceWorkerRegistrar />
      <BadgeClear />
      {children}
    </div>
  );
}
