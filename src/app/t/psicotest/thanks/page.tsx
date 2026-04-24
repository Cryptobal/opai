export const metadata = { title: "Evaluación enviada" };

export default function PsychThanksPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-sm p-8 text-center border border-border">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          ¡Listo! Tus respuestas fueron registradas
        </h1>
        <p className="text-muted-foreground mb-2">
          Gracias por tu tiempo. La empresa revisará tu evaluación en los
          próximos días y se comunicará contigo si corresponde.
        </p>
        <p className="text-sm text-muted-foreground mt-6">
          Puedes cerrar esta ventana.
        </p>
      </div>
    </main>
  );
}
