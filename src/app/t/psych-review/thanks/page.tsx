export const metadata = { title: "Firma registrada" };

export default function PsychReviewThanks() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-sm p-8 text-center border border-border">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Firma registrada
        </h1>
        <p className="text-muted-foreground">
          Tu revisión fue enviada a la empresa. El informe ahora incluye tu
          firma profesional. Puedes cerrar esta ventana.
        </p>
      </div>
    </main>
  );
}
