import Link from 'next/link';

/**
 * Hub - Módulo no implementado
 * Futuro: App switcher, login centralizado, gestión de sesiones
 */
export default function HubPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-md p-8 text-center">
        <div className="mb-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </div>
        </div>
        
        <h1 className="mb-3 text-3xl font-bold text-white">
          Hub OPAI
        </h1>
        
        <p className="mb-2 text-lg text-slate-300">
          Módulo no implementado
        </p>
        
        <p className="mb-8 text-sm text-slate-400">
          Este módulo estará disponible próximamente. Incluirá gestión centralizada de acceso, app switcher y configuración global.
        </p>
        
        <Link
          href="/opai"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Volver a Docs
        </Link>
      </div>
    </div>
  );
}
