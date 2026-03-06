import type { Metadata, Viewport } from "next";
import { PwaRegistrar } from "@/components/portal/cliente/PwaRegistrar";

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
  icons: { apple: "/iconos_azul/icon-192x192.png" },
};

export default function PortalClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white dark:bg-[#0a0a0f] text-zinc-900 dark:text-white transition-colors">
      <PwaRegistrar />
      {children}
    </div>
  );
}
