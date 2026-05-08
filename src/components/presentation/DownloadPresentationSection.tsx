"use client";

/**
 * Bloque público para descarga / instrucciones de PDF de presentación.
 */

export function DownloadPresentationSection(props: { uniqueId: string }) {
  return (
    <section className="mx-auto max-w-xl px-6 py-8 text-center text-sm text-white/70">
      <p>
        Para obtener el PDF de esta propuesta, el equipo comercial puede generarlo desde OPAI
        (herramienta interna). Referencia de presentación:{" "}
        <span className="font-mono text-white/90">{props.uniqueId}</span>
      </p>
    </section>
  );
}
