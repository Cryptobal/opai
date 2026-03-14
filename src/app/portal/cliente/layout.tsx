import type { Metadata, Viewport } from "next";
import { PwaRegistrar } from "@/components/portal/cliente/PwaRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060a13",
};

export const metadata: Metadata = {
  title: "OPAI — Portal Cliente",
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
    <div className="min-h-dvh text-white" style={{ paddingTop: 'var(--safe-area-top)' }}>
      <PwaRegistrar />
      <BadgeClear />
      {children}
    </div>
  );
}
