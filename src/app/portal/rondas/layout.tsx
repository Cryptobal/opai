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
  title: "OPAI — Portal Rondas",
  description: "Portal de rondas de supervisión para guardias.",
  manifest: "/portal-rondas-manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Rondas",
  },
};

export default function PortalRondasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh text-[#f5f5f5] antialiased">
      <ServiceWorkerRegistrar />
      <BadgeClear />
      {children}
    </div>
  );
}
