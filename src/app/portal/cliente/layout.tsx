import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "Portal de Seguridad — Gard Security",
  description: "Portal de cumplimiento y monitoreo de rondas de seguridad.",
  robots: { index: false, follow: false },
};

export default function PortalClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-white">
      {children}
    </div>
  );
}
