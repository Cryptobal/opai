import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";

const ServiceWorkerRegistrar = dynamic(
  () =>
    import("@/components/portal/rondas/ServiceWorkerRegistrar").then((m) => ({
      default: m.ServiceWorkerRegistrar,
    })),
  { ssr: false }
);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "OPAI Guardias — Gard Security",
  description: "Portal de guardias de seguridad.",
  manifest: "/manifest-guardia.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Guardias",
  },
  icons: { apple: "/iconos_azul/icon-192x192.png" },
};

export default function PortalGuardiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistrar />
      {children}
    </>
  );
}
