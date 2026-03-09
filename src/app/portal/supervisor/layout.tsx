import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ServiceWorkerRegistrar } from "@/components/portal/rondas/ServiceWorkerRegistrar";
import { BadgeClear } from "@/components/pwa/BadgeClear";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "Portal Supervisor — Gard Security",
  description: "Portal móvil para supervisores de seguridad.",
  manifest: "/manifest-supervisor.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Supervisor",
  },
  icons: { apple: "/iconos_azul/icon-192x192.png" },
};

export default async function PortalSupervisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) {
    redirect("/opai/login?callbackUrl=/portal/supervisor");
  }
  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-white">
      <ServiceWorkerRegistrar />
      <BadgeClear />
      {children}
    </div>
  );
}
