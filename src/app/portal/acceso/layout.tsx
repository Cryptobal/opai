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
    <div
      className="text-foreground antialiased"
      style={{
        // Fixed-viewport scroll shell — see marcacion/layout.tsx for the full
        // rationale. Scrolling inside this container (instead of growing the
        // document past `min-h-dvh`) fixes the low-end Android/Samsung bug where
        // the bottom controls were only reachable by swiping up from the very
        // bottom edge of the screen.
        // En Acceso el scroll lo posee el componente (AccessPortalApp fija su
        // shell a 100svh y su <main> aporta el overflow-y-auto). Para no crear
        // un segundo contexto de scroll que compita en Android, este layout NO
        // scrollea (overflowY:visible); solo aporta altura estable (100svh) y
        // las safe-areas.
        height: '100svh',
        minHeight: '100svh',
        overflowY: 'visible',
        paddingTop: 'var(--safe-area-top)',
        paddingBottom: 'var(--safe-area-bottom)',
      }}
    >
      <ServiceWorkerRegistrar scope="/portal/acceso" />
      <PlatformDataAttribute />
      <BadgeClear />
      <TerrenoModeSwitcher active="acceso" />
      {children}
    </div>
  );
}
