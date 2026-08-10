import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ServiceWorkerRegistrar } from "@/components/portal/rondas/ServiceWorkerRegistrar";
import { GlassAmbient } from "@/components/opai-ds/GlassAmbient";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060a13",
};

export const metadata: Metadata = {
  title: "OPAI — Supervisor",
  description: "Portal móvil para supervisores de seguridad.",
  manifest: "/manifest-supervisor.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Supervisor",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default async function PortalSupervisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) {
    redirect("/opai/login?portal=supervisor&callbackUrl=/portal/supervisor");
  }
  return (
    <div className="min-h-dvh text-white" style={{
        paddingTop: 'var(--safe-area-top)',
        paddingLeft: 'var(--safe-area-left)',
        paddingRight: 'var(--safe-area-right)',
      }}>
      <GlassAmbient />
      <ServiceWorkerRegistrar scope="/portal/supervisor" />
      {children}
    </div>
  );
}
