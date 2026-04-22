/**
 * Deriva el estado cliente-friendly de una marcación (PR6).
 *
 * Prioridad de estados (peor → mejor):
 *   fuera_rango > sin_gps > sin_foto > ok
 */
export type MarcacionEstado = "ok" | "fuera_rango" | "sin_gps" | "sin_foto";

export function computeMarcacionEstado(m: {
  gpsStatus: string | null;
  fotoEvidenciaUrl: string | null;
  lat: number | null;
  lng: number | null;
}): MarcacionEstado {
  if (m.gpsStatus === "fuera_rango") return "fuera_rango";
  if (m.lat == null || m.lng == null || m.gpsStatus === "sin_gps")
    return "sin_gps";
  if (!m.fotoEvidenciaUrl) return "sin_foto";
  return "ok";
}

export const VALID_ESTADOS = new Set<MarcacionEstado>([
  "ok",
  "fuera_rango",
  "sin_gps",
  "sin_foto",
]);
