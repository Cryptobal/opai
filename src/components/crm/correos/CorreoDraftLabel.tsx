/**
 * Etiqueta "Borrador" estilo Gmail: texto rojo/ámbar junto al remitente
 * en el listado de hilos (no chip/pill).
 */
export function CorreoDraftLabel() {
  return (
    <span
      data-correo-draft-label=""
      className="shrink-0 font-semibold text-status-danger-fg"
    >
      Borrador
    </span>
  );
}
