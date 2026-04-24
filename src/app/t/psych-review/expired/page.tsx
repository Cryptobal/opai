export const metadata = { title: "Enlace expirado" };

export default function PsychReviewExpired() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-sm p-8 text-center border border-border">
        <div className="text-5xl mb-4">⏱️</div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Enlace no válido
        </h1>
        <p className="text-muted-foreground">
          Este enlace de revisión no es válido o ya expiró. Solicita a la
          empresa que genere uno nuevo.
        </p>
      </div>
    </main>
  );
}
