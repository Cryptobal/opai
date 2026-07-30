import type { Metadata, Viewport } from "next";
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
  title: "Opai Terreno",
  description:
    "Portal de operaciones en terreno — Marcación, Rondas y Control de Acceso",
  manifest: "/manifest-terreno.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Opai Terreno",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalTerrenoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-dvh text-foreground antialiased"
      style={{ paddingTop: "var(--safe-area-top)" }}
    >
      <GlassAmbient />
      {children}
    </div>
  );
}
