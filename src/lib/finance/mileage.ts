/**
 * Cálculo de distancia y costo de rendiciones por kilometraje.
 *
 * Fuente única de verdad: tanto el preview (endpoint /estimate) como el cierre
 * de viaje (/trips/[id]/end) usan estas funciones, de modo que el monto que ve
 * el usuario sea idéntico al que se guarda y se paga.
 */

// Key server-side (NO la pública del navegador, que suele estar restringida por
// referrer y falla en llamadas server-side). Cae a la pública sólo como respaldo.
const MAPS_KEY =
  process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export type DistanceSource = "google" | "haversine";

// Resultado de la distancia por carretera. `fallbackReason` queda informado SOLO
// cuando source === "haversine", para que la causa del fallback (falta de key,
// REQUEST_DENIED por restricción de referrer, ZERO_RESULTS, error de red, etc.)
// quede visible en los logs de Vercel y, opcionalmente, en diagnóstico de UI.
export interface RoadDistanceResult {
  distanceKm: number;
  source: DistanceSource;
  fallbackReason?: string;
}

/** Distancia en línea recta (Haversine) en km. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distancia por carretera vía Google Directions. Si Google no responde una ruta
 * válida (key restringida, REQUEST_DENIED, ZERO_RESULTS, error de red), cae a la
 * distancia en línea recta — nunca devuelve 0 silencioso.
 */
export async function roadDistanceKm(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<RoadDistanceResult> {
  // Helper para construir el fallback en línea recta con la razón explícita.
  const haversineFallback = (fallbackReason: string): RoadDistanceResult => ({
    distanceKm: haversineKm(startLat, startLng, endLat, endLng),
    source: "haversine",
    fallbackReason,
  });

  if (!MAPS_KEY) {
    console.warn(
      "[Finance] roadDistanceKm: falta GOOGLE_MAPS_API_KEY server-side, usando línea recta",
    );
    return haversineFallback("no_key");
  }

  // Deja trazabilidad de qué key se está usando, sin exponer su valor.
  console.log(
    "[Finance] roadDistanceKm usando key:",
    process.env.GOOGLE_MAPS_API_KEY
      ? "server (GOOGLE_MAPS_API_KEY)"
      : "publica (NEXT_PUBLIC_*)",
  );

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${endLat},${endLng}&mode=driving&region=cl&key=${MAPS_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    const meters = data?.routes?.[0]?.legs?.[0]?.distance?.value;
    if (data?.status === "OK" && typeof meters === "number" && meters > 0) {
      return { distanceKm: meters / 1000, source: "google" };
    }

    const status = data?.status ?? "UNKNOWN";
    const errorMessage = data?.error_message ?? "";
    console.warn(
      "[Finance] Directions sin ruta válida, usando línea recta:",
      status,
      errorMessage,
    );
    return haversineFallback(
      errorMessage ? `${status}: ${errorMessage}` : status,
    );
  } catch (err) {
    console.error("[Finance] Error Directions API:", err);
    return haversineFallback("network_error");
  }
}

export interface MileageParams {
  distanceKm: number;
  kmPerLiter: number;
  fuelPricePerLiter: number;
  vehicleFeePct: number;
  tollAmount: number;
}

export interface MileageBreakdown {
  distanceKm: number;
  liters: number;
  fuelCost: number;
  vehicleFee: number;
  subtotal: number;
  tollAmount: number;
  totalAmount: number;
}

/** Desglose de costo del trayecto. Misma fórmula en preview y en guardado. */
export function mileageBreakdown({
  distanceKm,
  kmPerLiter,
  fuelPricePerLiter,
  vehicleFeePct,
  tollAmount,
}: MileageParams): MileageBreakdown {
  const liters = kmPerLiter > 0 ? distanceKm / kmPerLiter : 0;
  const fuelCost = Math.round(liters * fuelPricePerLiter);
  const vehicleFee = Math.round((fuelCost * vehicleFeePct) / 100);
  const subtotal = fuelCost + vehicleFee;
  const toll = Math.max(0, Math.round(tollAmount || 0));
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    liters: Math.round(liters * 100) / 100,
    fuelCost,
    vehicleFee,
    subtotal,
    tollAmount: toll,
    totalAmount: subtotal + toll,
  };
}
