export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <h1 className="text-6xl font-black text-white mb-4">404</h1>
        <p className="text-xl text-white/70 mb-8">Presentación no encontrada</p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-teal-500 to-teal-400 text-white font-bold hover:scale-105 transition-all"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}
