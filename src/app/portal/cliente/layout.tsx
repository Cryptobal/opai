import type { Metadata, Viewport } from "next";
import { PwaRegistrar } from "@/components/portal/cliente/PwaRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "OPAI Clientes — Gard Security",
  description: "Portal de clientes de seguridad.",
  manifest: "/manifest-cliente.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Clientes",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function PortalClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-white">
      <PwaRegistrar />
      <BadgeClear />
      {children}
    </div>
  );
}
