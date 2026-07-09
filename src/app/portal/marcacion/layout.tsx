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
    <div
      className="text-foreground antialiased"
      style={{
        // Fixed-viewport scroll shell. This used to be `min-h-dvh`, which let
        // the page grow past the viewport and rely on document-level scrolling.
        // On low-end Android/Samsung browsers that document scroll fights the
        // collapsing address bar, so the controls at the bottom of a screen
        // (capture / PIN / "Continuar") were unreachable unless the user swiped
        // up from the very bottom edge. Owning the viewport height here and
        // scrolling *inside* this container gives smooth, reliable scrolling on
        // every device without changing the visual layout.
        // 100svh (small viewport height) es la altura estable en Android: no se
        // recalcula al colapsar la barra de direcciones, a diferencia de 100dvh.
        // En Marcación el scroll lo posee este layout (las pantallas son
        // min-h-dvh centradas), así que mantenemos overflowY:auto.
        height: '100svh',
        minHeight: '100svh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'contain',
        paddingTop: 'var(--safe-area-top)',
        paddingBottom: 'var(--safe-area-bottom)',
      }}
    >
      <ServiceWorkerRegistrar scope="/portal/marcacion" />
      <PlatformDataAttribute />
      <BadgeClear />
      <TerrenoModeSwitcher active="marcacion" />
      {children}
    </div>
  );
}
