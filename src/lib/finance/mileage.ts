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
 * Intento vía la nueva Google Routes API (computeRoutes).
 *
 * IMPORTANTE: requiere que en Google Cloud esté habilitada la "Routes API"
 * específicamente — es DISTINTA de la "Directions API" (legacy). Tener una sin la
 * otra hace que este intento falle aunque la legacy funcione, y viceversa.
 *
 * La key viaja en el header `X-Goog-Api-Key` (no como query param). Una key
 * restringida por HTTP referrer FALLA aquí porque la llamada es server-side (sin
 * referrer): Google responde 403 PERMISSION_DENIED.
 *
 * Devuelve la distancia en km si hay ruta válida, o null junto con la razón del
 * fallo para que el llamador caiga al siguiente intento.
 */
async function tryRoutesApi(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  key: string,
): Promise<{ distanceKm: number } | { error: string }> {
  try {
    const res = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        },
        body: JSON.stringify({
          origin: {
            location: { latLng: { latitude: startLat, longitude: startLng } },
          },
          destination: {
            location: { latLng: { latitude: endLat, longitude: endLng } },
          },
          travelMode: "DRIVE",
          // Determinista y reproducible para auditoría (sin tráfico en tiempo real).
          routingPreference: "TRAFFIC_UNAWARE",
          units: "METRIC",
          regionCode: "CL",
        }),
      },
    );

    const data = await res.json();

    // La Routes API reporta errores con un objeto `error` { code, status, message }.
    if (!res.ok || data?.error) {
      const status = data?.error?.status ?? `HTTP_${res.status}`;
      const message = data?.error?.message ?? "";
      return { error: message ? `${status}: ${message}` : status };
    }

    const meters = data?.routes?.[0]?.distanceMeters;
    if (typeof meters === "number" && meters > 0) {
      return { distanceKm: meters / 1000 };
    }

    return { error: "ROUTES_ZERO_RESULTS" };
  } catch (err) {
    return {
      error: `network_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Intento vía la Directions API legacy (segundo intento, por si la cuenta tiene
 * habilitada Directions pero no Routes). Devuelve km o la razón del fallo.
 */
async function tryDirectionsApi(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  key: string,
): Promise<{ distanceKm: number } | { error: string }> {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${endLat},${endLng}&mode=driving&region=cl&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();

    const meters = data?.routes?.[0]?.legs?.[0]?.distance?.value;
    if (data?.status === "OK" && typeof meters === "number" && meters > 0) {
      return { distanceKm: meters / 1000 };
    }

    const status = data?.status ?? "UNKNOWN";
    const message = data?.error_message ?? "";
    return { error: message ? `${status}: ${message}` : status };
  } catch (err) {
    return {
      error: `network_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Distancia por carretera. Camino primario: nueva Google Routes API
 * (computeRoutes). Si falla, intenta la Directions API legacy. Si ambas fallan
 * (key restringida por referrer, API no habilitada, ZERO_RESULTS, error de red),
 * cae a la distancia en línea recta — nunca devuelve 0 silencioso, y siempre deja
 * `fallbackReason` para diagnóstico.
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

  // 1) Camino primario: Routes API (computeRoutes).
  const routes = await tryRoutesApi(startLat, startLng, endLat, endLng, MAPS_KEY);
  if ("distanceKm" in routes) {
    return { distanceKm: routes.distanceKm, source: "google" };
  }

  // 2) Fallback intermedio: Directions API legacy.
  const directions = await tryDirectionsApi(
    startLat,
    startLng,
    endLat,
    endLng,
    MAPS_KEY,
  );
  if ("distanceKm" in directions) {
    return { distanceKm: directions.distanceKm, source: "google" };
  }

  // 3) Ambas fallaron: línea recta con la razón completa de cada intento.
  const reason = `routes(${routes.error}) | directions(${directions.error})`;
  console.warn(
    "[Finance] Sin ruta válida de Google, usando línea recta:",
    reason,
  );
  return haversineFallback(reason);
}

/**
 * Decodifica una polyline codificada de Google (Encoded Polyline Algorithm) a un
 * arreglo de coordenadas. Es el mismo formato que devuelven Routes API y la
 * Directions legacy en `polyline.encodedPolyline` / `overview_polyline.points`.
 */
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

export interface RoadRouteResult {
  /** Coordenadas de la ruta real por calles. Vacío si se cayó a fallback. */
  path: { lat: number; lng: number }[];
  source: DistanceSource;
  fallbackReason?: string;
}

/**
 * Geometría de la ruta por carretera vía Google Routes API (computeRoutes),
 * pidiendo la polyline codificada y devolviéndola decodificada para dibujarla en
 * el mapa. Si falla, devuelve `path: []` con la razón — el llamador decide si cae
 * a la línea recta entre inicio y fin.
 *
 * IMPORTANTE: requiere la "Routes API" habilitada en Google Cloud y una key
 * server-side SIN restricción de referrer (igual que `roadDistanceKm`).
 */
export async function roadRouteGeometry(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<RoadRouteResult> {
  const fallback = (fallbackReason: string): RoadRouteResult => ({
    path: [],
    source: "haversine",
    fallbackReason,
  });

  if (!MAPS_KEY) return fallback("no_key");

  try {
    const res = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": MAPS_KEY,
          "X-Goog-FieldMask": "routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: {
            location: { latLng: { latitude: startLat, longitude: startLng } },
          },
          destination: {
            location: { latLng: { latitude: endLat, longitude: endLng } },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          units: "METRIC",
          regionCode: "CL",
        }),
      },
    );

    const data = await res.json();

    if (!res.ok || data?.error) {
      const status = data?.error?.status ?? `HTTP_${res.status}`;
      const message = data?.error?.message ?? "";
      const reason = message ? `${status}: ${message}` : status;
      console.warn("[Finance] roadRouteGeometry sin ruta, usando recta:", reason);
      return fallback(reason);
    }

    const encoded = data?.routes?.[0]?.polyline?.encodedPolyline;
    if (typeof encoded === "string" && encoded.length > 0) {
      return { path: decodePolyline(encoded), source: "google" };
    }

    return fallback("ROUTES_ZERO_RESULTS");
  } catch (err) {
    console.error("[Finance] Error roadRouteGeometry:", err);
    return fallback("network_error");
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
