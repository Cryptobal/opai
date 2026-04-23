export const metadata = { title: "Enlace expirado" };

export default function PsychExpiredPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="text-5xl mb-4">⏱️</div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Este enlace ya no es válido
        </h1>
        <p className="text-slate-600 mb-6">
          Es posible que el enlace haya expirado o que se haya generado uno
          nuevo. Contacta al equipo de Recursos Humanos para recibir un link
          actualizado.
        </p>
      </div>
    </main>
  );
}
