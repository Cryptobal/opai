export const metadata = { title: "Error inesperado" };

export default function PsychErrorPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Algo salió mal
        </h1>
        <p className="text-slate-600 mb-6">
          No pudimos cargar tu evaluación. Intenta nuevamente o contacta al
          equipo de Recursos Humanos.
        </p>
      </div>
    </main>
  );
}
