import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Patrullaje — Gard Security",
  description: "Sistema de patrullaje y rondas de seguridad",
  robots: "noindex, nofollow",
};

export default function PatrullajeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-white antialiased selection:bg-emerald-500/30">
      {children}
    </div>
  );
}
