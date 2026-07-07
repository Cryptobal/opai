import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/portal/rondas/ServiceWorkerRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";
import { TerrenoModeSwitcher } from "@/components/portal/TerrenoModeSwitcher";
import { PlatformDataAttribute } from "@/components/opai/portal-shell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalRondasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[#f5f5f5] antialiased"
      style={{
        // Fixed-viewport scroll shell — see marcacion/layout.tsx for the full
        // rationale. Scrolling inside this container (instead of growing the
        // document past `min-h-dvh`) fixes the low-end Android/Samsung bug where
        // the bottom controls were only reachable by swiping up from the very
        // bottom edge of the screen.
        height: '100dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'contain',
        paddingTop: 'var(--safe-area-top)',
      }}
    >
      <ServiceWorkerRegistrar scope="/portal/rondas" />
      <PlatformDataAttribute />
      <BadgeClear />
      <TerrenoModeSwitcher active="rondas" />
      {children}
    </div>
  );
}
