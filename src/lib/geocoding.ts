const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Geocode an address string to lat/lng using the Google Geocoding API.
 * Restricted to Chile (country:CL).
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address || !GOOGLE_MAPS_API_KEY) return null;

  try {
    const encoded = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&components=country:CL&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error("[Geocoding] Error:", error);
    return null;
  }
}

/**
 * Reverse-geocode lat/lng to a human-readable address using the Google
 * Geocoding API. Returns null if the key is missing or no result is found.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&region=CL&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" && data.results.length > 0) {
      return data.results[0].formatted_address as string;
    }
    return null;
  } catch (error) {
    console.error("[Geocoding] Reverse error:", error);
    return null;
  }
}
