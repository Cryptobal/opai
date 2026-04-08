import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060a13",
};

export const metadata: Metadata = {
  title: "Opai Personas",
  description: "Portal Personas — Opai",
  manifest: "/manifest-personas.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Opai Personas",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalPersonasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-dvh text-foreground antialiased"
      style={{ paddingTop: "var(--safe-area-top)" }}
    >
      {children}
    </div>
  );
}
