/**
 * API para resolver enlaces cortos de Google Maps.
 * Devuelve las coordenadas extraídas de la URL resuelta.
 * El reverse geocoding se hace en el cliente (browser) con la Geocoder API
 * ya que la API key tiene restricción de referer HTTP.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { parseGoogleMapsUrl, isGoogleMapsUrl } from "@/lib/google-maps-url";

/** Resuelve enlaces cortos (maps.app.goo.gl, goo.gl/maps) a la URL final de Google Maps. */
async function resolveMapsUrl(inputUrl: string): Promise<string> {
  const trimmed = inputUrl.trim();
  const isShort =
    /maps\.app\.goo\.gl/i.test(trimmed) || /goo\.gl\/maps/i.test(trimmed);
  if (!isShort) return trimmed;

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
      const coords = parseGoogleMapsUrl(url);
      if (coords) return url;
      continue;
    }

    try {
      const html = await res.text();
      const htmlMatch = html.match(/https?:\/\/(?:www\.)?(?:maps\.)?google\.com[^\s"'<>]*/);
      if (htmlMatch) {
        const coords = parseGoogleMapsUrl(htmlMatch[0]);
        if (coords) return htmlMatch[0];
      }
    } catch {
      // ignore
    }
    break;
  }
  return url;
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const rawUrl = String(body.url || "").trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Se requiere una url." }, { status: 400 });
  }

  if (!isGoogleMapsUrl(rawUrl)) {
    return NextResponse.json(
      { error: "No es una URL de Google Maps válida." },
      { status: 400 }
    );
  }

  // Si la URL ya tiene coordenadas parseables (URL larga), devolverlas directamente
  const directCoords = parseGoogleMapsUrl(rawUrl);
  if (directCoords) {
    return NextResponse.json({ lat: directCoords.lat, lng: directCoords.lng });
  }

  // Resolver enlace corto
  const finalUrl = await resolveMapsUrl(rawUrl);
  const coords = parseGoogleMapsUrl(finalUrl);
  if (!coords) {
    return NextResponse.json(
      { error: "No se pudieron extraer coordenadas de la URL. Prueba con el enlace largo de Google Maps." },
      { status: 400 }
    );
  }

  return NextResponse.json({ lat: coords.lat, lng: coords.lng });
}
