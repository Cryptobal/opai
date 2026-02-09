export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-black text-foreground mb-4">404</h1>
        <p className="text-lg text-muted-foreground mb-8">Página no encontrada</p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}
