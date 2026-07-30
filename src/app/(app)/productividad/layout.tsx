import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0f1a",
};

export const metadata: Metadata = {
  title: "Opai Productividad",
  description: "Portal Productividad — Correos, Tareas, Agenda y Tickets",
  manifest: "/manifest-productividad.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Productividad",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function ProductividadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
