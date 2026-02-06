import Link from 'next/link';

/**
 * CRM - Módulo no implementado
 * Futuro: Integración con Zoho CRM, gestión de clientes, pipeline
 */
export default function CRMPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-md p-8 text-center">
        <div className="mb-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10 text-purple-500">
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
        </div>
        
        <h1 className="mb-3 text-3xl font-bold text-white">
          CRM OPAI
        </h1>
        
        <p className="mb-2 text-lg text-slate-300">
          Módulo no implementado
        </p>
        
        <p className="mb-8 text-sm text-slate-400">
          Este módulo estará disponible próximamente. Incluirá integración con Zoho CRM, gestión de clientes, pipeline de ventas y reportes.
        </p>
        
        <Link
          href="/opai"
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 font-medium text-white transition-colors hover:bg-purple-700"
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
