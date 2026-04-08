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
  title: "Opai",
  description: "Portal personal — Opai",
  manifest: "/manifest-personal.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Opai",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalPersonalLayout({
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
