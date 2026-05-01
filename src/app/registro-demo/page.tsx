import type { Metadata } from "next";
import { RegistroDemoForm } from "./RegistroDemoForm";

export const metadata: Metadata = {
  title: "Registro Demo — Portal de Clientes OPAI",
  description:
    "Regístrese en 30 segundos y acceda a una demo del Portal de Clientes de OPAI. Monitoree rondas, asistencia, incidencias y más.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Registro Demo — Portal de Clientes OPAI",
    description:
      "Regístrese en 30 segundos y acceda a una demo del Portal de Clientes de OPAI.",
    url: "https://www.opai.cl/registro-demo",
    type: "website",
    images: [{ url: "/icons/og-image.png", width: 1200, height: 630, alt: "OPAI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Registro Demo — Portal de Clientes OPAI",
    description:
      "Regístrese en 30 segundos y acceda a una demo del Portal de Clientes de OPAI.",
    images: ["/icons/og-image.png"],
  },
};

export default async function RegistroDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ utm_source?: string; utm_campaign?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="min-h-screen bg-[#060a13] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a1628]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <img
            src="/Logo%20Gard%20Blanco.png"
            alt="OPAI"
            className="h-8"
          />
          <span className="text-xs text-slate-500 tracking-wider uppercase hidden sm:block">
            Powered by OPAI
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Title area */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-status-info-soft px-4 py-1.5 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-xs font-semibold text-status-info-fg tracking-wide uppercase">
                Acceso demo gratuito
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Conozca el Portal de Clientes
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Regístrese en 30 segundos y explore cómo OPAI le da control total
              sobre la seguridad de sus instalaciones.
            </p>
          </div>

          {/* Form */}
          <RegistroDemoForm
            utmSource={sp.utm_source || ""}
            utmCampaign={sp.utm_campaign || ""}
          />

          {/* Trust indicators */}
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-status-info-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>+15 años</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-status-info-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>OS-10 certificado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-status-info-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Supervisión 24/7</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center">
        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} OPAI
        </p>
      </footer>
    </div>
  );
}
