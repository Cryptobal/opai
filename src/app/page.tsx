export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-b from-slate-950 to-slate-900">
      <div className="z-10 max-w-5xl w-full items-center justify-center text-center space-y-8">
        <h1 className="text-5xl font-black bg-gradient-to-r from-teal-400 to-teal-300 bg-clip-text text-transparent">
          Gard Docs
        </h1>
        <p className="text-xl text-slate-400">
          Sistema de Presentaciones Comerciales Inteligente
        </p>
        <p className="text-sm text-slate-500 animate-pulse">
          Proyecto en construcción...
        </p>
        <div className="pt-8">
          <a
            href="/opai/login"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-gradient-to-r from-teal-600 to-teal-500 text-white font-bold hover:from-teal-500 hover:to-teal-400 transition-all transform hover:scale-105 shadow-lg shadow-teal-500/20"
          >
            Iniciar Sesión
          </a>
        </div>
      </div>
    </main>
  );
}
