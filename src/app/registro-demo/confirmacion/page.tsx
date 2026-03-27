import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Registro Exitoso — Portal de Clientes Gard Security",
  description: "Su cuenta demo ha sido creada. Revise su email para obtener sus credenciales de acceso.",
  robots: { index: false, follow: false },
};

const FEATURES = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: "Dashboard en tiempo real",
    desc: "Estado de instalaciones, guardias en servicio y métricas clave.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
    title: "Control de rondas",
    desc: "Monitoreo de rondas con GPS y verificación biométrica.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: "Reportes automáticos",
    desc: "Novedades, incidencias y cumplimiento sin tener que pedirlos.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
      </svg>
    ),
    title: "Sistema de tickets",
    desc: "Levante requerimientos con seguimiento transparente.",
  },
];

export default function ConfirmacionPage() {
  return (
    <div className="min-h-screen bg-[#060a13] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a1628]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <img
            src="/Logo%20Gard%20Blanco.png"
            alt="Gard Security"
            className="h-8"
          />
          <span className="text-xs text-slate-500 tracking-wider uppercase hidden sm:block">
            Powered by OPAI
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg text-center">
          {/* Success icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/10 ring-1 ring-teal-500/20">
            <svg className="h-8 w-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Registro exitoso
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-2">
            Revise su bandeja de entrada — le enviamos un email con sus
            credenciales de acceso al portal.
          </p>
          <p className="text-xs text-slate-600 mb-8">
            Si no lo encuentra, revise la carpeta de spam o promociones.
          </p>

          {/* CTA */}
          <Link
            href="/portal/cliente"
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          >
            Ir al portal
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>

          {/* Features preview */}
          <div className="mt-12">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-5">
              Lo que encontrará en el portal
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="flex items-start gap-3 rounded-lg border border-white/5 bg-[#0a1628] p-4 text-left"
                >
                  <div className="flex-shrink-0 text-teal-400 mt-0.5">{f.icon}</div>
                  <div>
                    <p className="text-sm font-medium text-white">{f.title}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center">
        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} Gard Security SpA · {" "}
          <a
            href="https://www.gard.cl"
            className="text-slate-500 hover:text-teal-400 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.gard.cl
          </a>
        </p>
      </footer>
    </div>
  );
}
