import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "Rondas — Gard Security",
  description: "Portal de rondas de supervisión para guardias.",
  manifest: "/portal-rondas-manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rondas Gard",
  },
};

export default function PortalRondasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-[#f5f5f5] antialiased">
      {children}
    </div>
  );
}
