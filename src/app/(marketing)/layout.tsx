import type { Metadata } from "next";
import { Syne, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
  weight: ["700", "800"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "OPAI — ERP para Empresas de Seguridad Privada en Chile",
  description:
    "Sistema de gestión integral para empresas de seguridad privada. Gestión de guardias, control de rondas GPS, marcaciones, payroll y portal del cliente. El único ERP con IA diseñado para la seguridad privada en Chile.",
  keywords: [
    "ERP empresas de seguridad privada",
    "software empresa de seguridad Chile",
    "sistema de guardia de seguridad",
    "control de rondas GPS",
    "sistema de control de rondas",
    "gestión guardias de seguridad",
    "sistema de seguridad privada",
    "portal del guardia de seguridad",
    "portal del cliente seguridad",
    "control de acceso empresas seguridad",
    "sistema de marcación guardias",
    "payroll empresa de seguridad Chile",
    "ERP seguridad privada Chile",
  ],
  openGraph: {
    title: "OPAI — ERP para Empresas de Seguridad Privada en Chile",
    description:
      "Un solo sistema con IA para gestionar guardias, rondas, marcaciones, payroll y portal del cliente.",
    images: [
      { url: "/brand/opai/social/og-image.png", width: 1200, height: 630 },
    ],
    locale: "es_CL",
    type: "website",
    url: "https://opai.cl",
    siteName: "OPAI",
  },
  twitter: {
    card: "summary_large_image",
    title: "OPAI — ERP para Empresas de Seguridad Privada en Chile",
    description:
      "Gestión de guardias, rondas GPS, payroll y portal del cliente en un solo sistema con IA.",
    images: ["/brand/opai/social/og-image.png"],
  },
  alternates: { canonical: "https://opai.cl" },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/brand/opai/svg/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/opai/favicon/favicon-180x180.png", sizes: "180x180" }],
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${syne.variable} ${jakarta.variable} ${jetbrains.variable} marketing-landing`}
    >
      <style>{`
        .marketing-landing {
          --opai-teal: #00D4AA;
          --opai-teal2: #00B894;
          --opai-navy: #0B1120;
          --opai-obsidian: #06080F;
          --opai-card: #141E30;
          --opai-text: #E2E8F0;
          --opai-muted: #94A3B8;
          --opai-border: rgba(255,255,255,0.07);
          font-family: var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif;
          color: var(--opai-text);
          background: var(--opai-navy);
        }
        .marketing-landing h1,
        .marketing-landing h2,
        .marketing-landing h3,
        .marketing-landing h4 {
          font-family: var(--font-syne), 'Syne', sans-serif;
        }
        .marketing-landing code,
        .marketing-landing .font-mono {
          font-family: var(--font-jetbrains), 'JetBrains Mono', monospace;
        }
      `}</style>
      {children}
    </div>
  );
}
