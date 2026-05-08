/**
 * Renderer de payload de presentación comercial (rutas /p y /preview).
 * Implementación compacta hasta integrar las 29 secciones legacy.
 */

type Payload = Record<string, unknown>;

function companyFromPayload(payload: Payload): string {
  const client = payload.client;
  if (client && typeof client === "object" && client !== null && "company_name" in client) {
    const n = (client as { company_name?: string }).company_name;
    if (n) return n;
  }
  return "Cliente";
}

export function PresentationRenderer({
  payload,
  pdfMode = false,
  hideEconomicSections = false,
}: {
  payload: Payload;
  pdfMode?: boolean;
  hideEconomicSections?: boolean;
}) {
  const company = companyFromPayload(payload);
  const subject =
    typeof payload.quote === "object" && payload.quote !== null && "Subject" in payload.quote
      ? String((payload.quote as { Subject?: string }).Subject ?? "")
      : typeof payload.quote === "object" && payload.quote !== null && "subject" in payload.quote
        ? String((payload.quote as { subject?: string }).subject ?? "")
        : "";

  return (
    <main
      className={`min-h-screen bg-slate-950 text-white ${pdfMode ? "pdf-mode px-8 py-6" : "px-6 py-12"}`}
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Propuesta comercial</h1>
        <p className="text-sm text-white/75">
          <span className="font-semibold text-white">Empresa:</span> {company}
        </p>
        {subject ? (
          <p className="text-sm text-white/75">
            <span className="font-semibold text-white">Asunto:</span> {subject}
          </p>
        ) : null}
        {!pdfMode ? (
          <p className="text-xs text-white/45">
            Si no ves todas las secciones, tu equipo puede completar la plantilla en una iteración
            posterior. El PDF de alta fidelidad se genera desde el flujo de envío cuando corresponda.
          </p>
        ) : null}
        {hideEconomicSections ? (
          <p className="text-xs text-amber-200/90">
            Vista comercial: detalle económico resumido en el documento oficial.
          </p>
        ) : null}
      </div>
    </main>
  );
}
