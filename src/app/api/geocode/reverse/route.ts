/**
 * Reverse geocoding: lat,lng -> dirección formateada, ciudad, comuna.
 * Usado al pegar una URL de Google Maps en el modal de edición de instalación.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { parseGoogleMapsUrl, isGoogleMapsUrl } from "@/lib/google-maps-url";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

/** Resuelve enlaces cortos (maps.app.goo.gl, goo.gl/maps) a la URL final de Google Maps. */
async function resolveMapsUrl(inputUrl: string): Promise<string> {
  const trimmed = inputUrl.trim();
  const isShort =
    /maps\.app\.goo\.gl/i.test(trimmed) || /goo\.gl\/maps/i.test(trimmed);
  if (!isShort) return trimmed;

  // Seguir redirects manualmente (max 10 hops) para obtener la URL larga
  let url = trimmed;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const location = res.headers.get("location");
    if (location) {
      url = location.startsWith("/") ? new URL(location, url).href : location;
      if (/google\.com\/maps/i.test(url) || /maps\.google\.com/i.test(url)) {
        return url;
      }
      continue;
    }

    // Sin más redirects: intentar extraer URL de google maps del HTML
    try {
      const html = await res.text();
      const htmlMatch = html.match(/https?:\/\/(?:www\.)?google\.com\/maps[^\s"'<>]*/);
      if (htmlMatch) return htmlMatch[0];
    } catch {
      // ignore
    }
    break;
  }
  return url;
}

interface GeoAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GeoResult {
  formatted_address?: string;
  address_components?: GeoAddressComponent[];
  geometry?: { location?: { lat: number; lng: number } };
}

function parseComunaFromFormattedAddress(formatted: string): string {
  const parts = formatted.split(", ").map((p) => p.trim());
  if (parts.length >= 2 && parts[parts.length - 1] === "Chile") {
    const comuna = parts[1];
    if (comuna && comuna.length < 50 && !/^\d+$/.test(comuna)) return comuna;
  }
  return "";
}

function extractCityAndCommune(result: GeoResult): { city: string; commune: string } {
  const formatted = result.formatted_address || "";
  const comps = result.address_components || [];
  const getByType = (types: string[]) =>
    comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? "";

  const locality = getByType(["locality"]);
  const admin1 = getByType(["administrative_area_level_1"]);
  const admin2 = getByType(["administrative_area_level_2"]);
  const admin3 = getByType(["administrative_area_level_3"]);
  const sublocality1 = getByType(["sublocality_level_1"]);
  const sublocality = getByType(["sublocality"]);
  const fromFormatted = parseComunaFromFormattedAddress(formatted);

  const commune =
    admin3 ||
    sublocality1 ||
    sublocality ||
    (locality && locality !== "Santiago" ? locality : "") ||
    admin2 ||
    fromFormatted ||
    locality ||
    "";

  let city: string;
  if (admin1 && /Metropolitana|Santiago/i.test(admin1)) {
    city = "Santiago";
  } else if (locality) {
    city = locality;
  } else {
    city = admin1 || admin2 || "";
  }

  return { city, commune };
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: "Geocoding no configurado (falta API key)." },
      { status: 503 }
    );
  }

  let body: { lat?: number; lng?: number; url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  let lat: number;
  let lng: number;

  if (body.url != null && String(body.url).trim()) {
    const rawUrl = String(body.url).trim();
    if (!isGoogleMapsUrl(rawUrl)) {
      return NextResponse.json(
        { error: "No es una URL de Google Maps válida." },
        { status: 400 }
      );
    }
    const finalUrl = await resolveMapsUrl(rawUrl);
    const coords = parseGoogleMapsUrl(finalUrl);
    if (!coords) {
      return NextResponse.json(
        { error: "No se pudieron extraer coordenadas de la URL. Prueba con el enlace largo de Google Maps." },
        { status: 400 }
      );
    }
    lat = coords.lat;
    lng = coords.lng;
  } else if (
    typeof body.lat === "number" &&
    typeof body.lng === "number" &&
    Number.isFinite(body.lat) &&
    Number.isFinite(body.lng)
  ) {
    lat = body.lat;
    lng = body.lng;
  } else {
    return NextResponse.json(
      { error: "Se requieren lat y lng numéricos, o una url de Google Maps." },
      { status: 400 }
    );
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=es&region=cl`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "ZERO_RESULTS" || !data.results?.length) {
    return NextResponse.json(
      { error: "No se encontró dirección para esas coordenadas." },
      { status: 404 }
    );
  }

  if (data.status !== "OK") {
    return NextResponse.json(
      { error: data.error_message || "Error en Geocoding API." },
      { status: 502 }
    );
  }

  const first = data.results[0] as GeoResult;
  const { city, commune } = extractCityAndCommune(first);
  const location = first.geometry?.location;

  return NextResponse.json({
    address: first.formatted_address || "",
    city,
    commune,
    lat: location?.lat ?? lat,
    lng: location?.lng ?? lng,
  });
}
