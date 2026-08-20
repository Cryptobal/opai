/**
 * Artículo 22 Código del Trabajo: exento de limitación de jornada.
 * Quien está marcado Art. 22 no marca entrada/salida.
 */

export const ART22_MARCACION_ERROR =
  "Este trabajador está bajo Artículo 22 y no marca entrada/salida.";

export function rejectArticulo22Marcacion(isArticulo22: boolean | null | undefined): string | null {
  return isArticulo22 ? ART22_MARCACION_ERROR : null;
}
